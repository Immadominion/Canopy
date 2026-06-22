"use client";

import { type WalletName, WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { getBase58Decoder } from "@solana/kit";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Inline SIWS message builder — no Node.js crypto, safe in client components.
// Mirrors lib/auth/siws.ts#buildSIWSMessage exactly.
// ---------------------------------------------------------------------------
function buildSIWSMessage(opts: {
    domain: string;
    address: string;
    nonce: string;
    issuedAt: string;
    expiresAt: string;
}): string {
    return [
        `${opts.domain} wants you to sign in with your Solana account:`,
        opts.address,
        ``,
        `Sign in to Canopy — Developer Infrastructure for Solana Mobile`,
        ``,
        `URI: https://${opts.domain}`,
        `Version: 1`,
        `Nonce: ${opts.nonce}`,
        `Issued At: ${opts.issuedAt}`,
        `Expiration Time: ${opts.expiresAt}`,
    ].join("\n");
}

// Shown only when no Wallet Standard wallet is detected — a real path forward
// instead of a dead end. Order: most common first.
const WALLET_INSTALL_LINKS = [
    { name: "PHANTOM", url: "https://phantom.app/download" },
    { name: "SOLFLARE", url: "https://solflare.com/download" },
] as const;

// ---------------------------------------------------------------------------
// Status labels — Nothing Design: inline text, no toast, no spinner.
// ---------------------------------------------------------------------------
type SignInStatus = "idle" | "connecting" | "signing" | "verifying" | "error";

function statusLabel(status: SignInStatus, errorCode: string): string | null {
    switch (status) {
        case "connecting":
            return "[ CONNECTING... ]";
        case "signing":
            return "[ WAITING FOR SIGNATURE ]";
        case "verifying":
            return "[ VERIFYING ]";
        case "error":
            return `[ ERROR: ${errorCode} ]`;
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SIWSWalletConnect() {
    const router = useRouter();
    const { wallets, select, connect, wallet, publicKey, signMessage, connected } = useWallet();

    const [status, setStatus] = useState<SignInStatus>("idle");
    const [errorCode, setErrorCode] = useState("");
    // Guard against double-signing on rapid re-renders.
    const signingInFlight = useRef(false);
    // Guard against firing connect() more than once per selection.
    const connectInFlight = useRef(false);

    // Wallet detection is client-only: the server has no `window` and sees zero
    // installed wallets, while the client sees Phantom/Solflare. Rendering the
    // wallet list before mount causes a hydration mismatch. Gate on `mounted`
    // so the server and first client paint render the same neutral state.
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Wallet Standard wallets auto-register; Phantom/Solflare may appear twice
    // (once via explicit adapter, once via Wallet Standard). Dedupe by name.
    const seen = new Set<string>();
    const availableWallets = wallets.filter((w) => {
        if (
            (w.readyState !== WalletReadyState.Installed &&
                w.readyState !== WalletReadyState.Loadable) ||
            seen.has(w.adapter.name)
        ) {
            return false;
        }
        seen.add(w.adapter.name);
        return true;
    });

    // When a wallet becomes connected (after the user approves in their wallet),
    // automatically begin the SIWS signing flow.
    useEffect(() => {
        if (
            !connected ||
            !publicKey ||
            !signMessage ||
            status !== "connecting" ||
            signingInFlight.current
        ) {
            return;
        }

        signingInFlight.current = true;
        const walletAddress = publicKey.toString();

        async function runSIWS() {
            if (!signMessage) return;

            setStatus("signing");

            // 1. Fetch a fresh nonce from our API.
            let nonce: string;
            try {
                const res = await fetch("/api/v1/auth/nonce");
                if (!res.ok) throw new Error("nonce_fetch");
                const data = (await res.json()) as { nonce: string };
                nonce = data.nonce;
            } catch {
                setStatus("error");
                setErrorCode("NONCE_FETCH_FAILED");
                signingInFlight.current = false;
                return;
            }

            // 2. Build and sign the SIWS message.
            const now = new Date();
            const expires = new Date(now.getTime() + 5 * 60 * 1000);
            const message = buildSIWSMessage({
                domain: window.location.host,
                address: walletAddress,
                nonce,
                issuedAt: now.toISOString(),
                expiresAt: expires.toISOString(),
            });

            let signatureBytes: Uint8Array;
            try {
                signatureBytes = await signMessage(new TextEncoder().encode(message));
            } catch {
                setStatus("error");
                setErrorCode("SIGNATURE_REJECTED");
                signingInFlight.current = false;
                return;
            }

            // 3. Base58-encode and POST to the verify endpoint.
            const signature = getBase58Decoder().decode(signatureBytes);
            setStatus("verifying");

            try {
                const verifyRes = await fetch("/api/v1/auth/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wallet: walletAddress, signature, message, nonce }),
                });

                if (!verifyRes.ok) {
                    const errData = (await verifyRes.json().catch(() => ({}))) as {
                        error?: { code?: string };
                    };
                    setStatus("error");
                    setErrorCode(errData?.error?.code ?? "VERIFICATION_FAILED");
                    signingInFlight.current = false;
                    return;
                }

                // Session cookie is set in the verify response — navigate to dashboard.
                router.push("/dashboard/apps");
            } catch {
                setStatus("error");
                setErrorCode("NETWORK_ERROR");
                signingInFlight.current = false;
            }
        }

        void runSIWS();
    }, [connected, publicKey, signMessage, status, router]);

    // Connect once the adapter for the selected wallet has actually resolved.
    // Calling connect() synchronously after select() throws WalletNotSelectedError:
    // select() only schedules a state update, so `wallet` is still null on that
    // tick. Driving connect() from this effect (keyed on the resolved `wallet`)
    // removes the race — no more first-click error.
    useEffect(() => {
        if (status !== "connecting" || !wallet || connected || connectInFlight.current) {
            return;
        }
        if (
            wallet.readyState !== WalletReadyState.Installed &&
            wallet.readyState !== WalletReadyState.Loadable
        ) {
            return;
        }
        connectInFlight.current = true;
        connect()
            .catch(() => {
                // User cancelled, or the wallet rejected the connection.
                setStatus((prev) => (prev === "connecting" ? "error" : prev));
                setErrorCode("WALLET_CONNECT_CANCELLED");
                signingInFlight.current = false;
            })
            .finally(() => {
                connectInFlight.current = false;
            });
    }, [wallet, status, connected, connect]);

    // Selecting a wallet only sets state; the effect above performs the connect
    // once the adapter is ready. The user then approves in their wallet popup.
    const handleWalletSelect = useCallback(
        (walletName: WalletName<string>) => {
            if (status !== "idle" && status !== "error") return;
            setStatus("connecting");
            setErrorCode("");
            signingInFlight.current = false;
            select(walletName);
        },
        [select, status],
    );

    const label = statusLabel(status, errorCode);

    return (
        <div>
            {!mounted ? (
                // Stable placeholder — matches server render, avoids hydration mismatch.
                <div className="py-nd-lg">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        [ DETECTING WALLETS... ]
                    </p>
                </div>
            ) : availableWallets.length === 0 ? (
                <div className="py-nd-lg">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        NO WALLET DETECTED
                    </p>
                    <p className="mt-nd-sm font-body text-nd-body-sm text-nd-text-disabled">
                        Install a Solana wallet to continue.
                    </p>
                    <div className="mt-nd-md flex items-center justify-center gap-nd-lg">
                        {WALLET_INSTALL_LINKS.map((wallet) => (
                            <a
                                key={wallet.name}
                                href={wallet.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-nd-label text-nd-text-secondary hover:text-nd-text-primary uppercase tracking-[0.08em] transition-colors"
                            >
                                {wallet.name} →
                            </a>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-nd-sm">
                    {availableWallets.map((w) => (
                        <button
                            key={w.adapter.name}
                            onClick={() => handleWalletSelect(w.adapter.name as WalletName<string>)}
                            disabled={status !== "idle" && status !== "error"}
                            className="w-full flex items-center justify-between px-nd-md py-nd-md border border-nd-border-visible hover:border-nd-text-disabled transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
                        >
                            <span className="font-mono text-nd-label text-nd-text-primary uppercase tracking-[0.08em]">
                                {w.adapter.name}
                            </span>
                            <span className="font-mono text-nd-label text-nd-text-disabled group-hover:text-nd-accent transition-colors">
                                →
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Always-mounted live regions so assistive tech announces sign-in
                progress and errors on this launch-critical flow. The visible
                text below is aria-hidden to avoid a double announcement. */}
            <p role="status" aria-live="polite" className="sr-only">
                {status !== "error" ? label ?? "" : ""}
            </p>
            <p role="alert" aria-live="assertive" className="sr-only">
                {status === "error" ? label ?? "" : ""}
            </p>
            {/* Inline status — no toast, no spinner (Nothing Design rule) */}
            {label !== null && (
                <p
                    aria-hidden="true"
                    className={`mt-nd-md font-mono text-nd-label uppercase tracking-[0.08em] ${status === "error" ? "text-nd-accent" : "text-nd-text-disabled"
                        }`}
                >
                    {label}
                </p>
            )}
        </div>
    );
}
