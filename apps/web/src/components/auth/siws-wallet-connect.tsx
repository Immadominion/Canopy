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
    const { wallets, select, connect, publicKey, signMessage, connected } = useWallet();

    const [status, setStatus] = useState<SignInStatus>("idle");
    const [errorCode, setErrorCode] = useState("");
    // Guard against double-signing on rapid re-renders.
    const signingInFlight = useRef(false);

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

    // Select the wallet and call connect() — user approves in their wallet popup.
    const handleWalletSelect = useCallback(
        async (walletName: WalletName<string>) => {
            if (status !== "idle" && status !== "error") return;

            setStatus("connecting");
            setErrorCode("");
            signingInFlight.current = false;

            try {
                select(walletName);
                await connect();
            } catch {
                // connect() rejects when the user cancels. Reset unless we already
                // moved past "connecting" (i.e. the useEffect fired first).
                setStatus((prev) => (prev === "connecting" ? "error" : prev));
                setErrorCode("WALLET_CONNECT_CANCELLED");
                signingInFlight.current = false;
            }
        },
        [select, connect, status],
    );

    const label = statusLabel(status, errorCode);

    return (
        <div>
            {availableWallets.length === 0 ? (
                <div className="py-nd-lg">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        NO WALLET DETECTED
                    </p>
                    <p className="mt-nd-sm font-body text-nd-body-sm text-nd-text-disabled">
                        Install Phantom, Solflare, or any Wallet Standard wallet.
                    </p>
                </div>
            ) : (
                <div className="space-y-nd-sm">
                    {availableWallets.map((w) => (
                        <button
                            key={w.adapter.name}
                            onClick={() => void handleWalletSelect(w.adapter.name as WalletName<string>)}
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

            {/* Inline status — no toast, no spinner (Nothing Design rule) */}
            {label !== null && (
                <p
                    className={`mt-nd-md font-mono text-nd-label uppercase tracking-[0.08em] ${status === "error" ? "text-nd-accent" : "text-nd-text-disabled"
                        }`}
                >
                    {label}
                </p>
            )}
        </div>
    );
}
