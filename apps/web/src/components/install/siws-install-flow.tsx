"use client";

import { type WalletName, WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { getBase58Decoder } from "@solana/kit";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Inline SIWS message builder — mirrors lib/auth/siws.ts
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

type FlowStatus =
    | "idle"
    | "connecting"
    | "signing"
    | "verifying"
    | "initiating"
    | "ready"
    | "not_allowed"
    | "error";

function statusLabel(status: FlowStatus, errorCode: string): string | null {
    switch (status) {
        case "connecting":
            return "[ CONNECTING... ]";
        case "signing":
            return "[ WAITING FOR SIGNATURE ]";
        case "verifying":
            return "[ VERIFYING ]";
        case "initiating":
            return "[ CHECKING ACCESS ]";
        case "not_allowed":
            return "[ ACCESS DENIED — WALLET NOT ON ALLOWLIST ]";
        case "error":
            return `[ ERROR: ${errorCode} ]`;
        default:
            return null;
    }
}

interface Props {
    trackId: string;
    /** True if the user already has a valid Supabase session (detected server-side). */
    isAuthenticated: boolean;
}

/**
 * SIWSInstallFlow — wallet-gated APK download for testers.
 *
 * Flow:
 *  1. If already authenticated: skip to step 3
 *  2. Connect wallet → sign SIWS → verify → session cookie set
 *  3. POST /api/v1/beta/install/initiate → signed download URL
 *  4. Show download link
 *
 * 404 from initiate = wallet not on allowlist or track not active/expired.
 * Shown as "ACCESS DENIED" — never reveals why (Invariant 5).
 */
export function SIWSInstallFlow({ trackId, isAuthenticated }: Props) {
    const { wallets, select, connect, publicKey, signMessage, connected } = useWallet();

    const [status, setStatus] = useState<FlowStatus>(
        isAuthenticated ? "initiating" : "idle",
    );
    const [errorCode, setErrorCode] = useState("");
    const [downloadUrl, setDownloadUrl] = useState("");
    const [downloadExpiresAt, setDownloadExpiresAt] = useState("");

    const signingInFlight = useRef(false);
    const initiateInFlight = useRef(false);

    // ── Step 3: call install/initiate once authenticated ────────────────────
    useEffect(() => {
        if (status !== "initiating" || initiateInFlight.current) return;

        initiateInFlight.current = true;

        async function callInitiate() {
            try {
                const res = await fetch("/api/v1/beta/install/initiate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ trackId }),
                });

                if (res.status === 401) {
                    // Session expired — reset to SIWS flow
                    setStatus("idle");
                    initiateInFlight.current = false;
                    return;
                }

                if (res.status === 404) {
                    setStatus("not_allowed");
                    initiateInFlight.current = false;
                    return;
                }

                if (!res.ok) {
                    const data = (await res.json()) as { error?: { code?: string } };
                    setErrorCode(data.error?.code ?? "INITIATE_FAILED");
                    setStatus("error");
                    initiateInFlight.current = false;
                    return;
                }

                const data = (await res.json()) as { url: string; expiresAt: string };
                setDownloadUrl(data.url);
                setDownloadExpiresAt(data.expiresAt);
                setStatus("ready");
                initiateInFlight.current = false;
            } catch {
                setErrorCode("NETWORK_ERROR");
                setStatus("error");
                initiateInFlight.current = false;
            }
        }

        void callInitiate();
    }, [status, trackId]);

    // ── Step 2: SIWS sign flow — fires when wallet connects ─────────────────
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

                // Session established — move to initiate
                signingInFlight.current = false;
                setStatus("initiating");
            } catch {
                setStatus("error");
                setErrorCode("NETWORK_ERROR");
                signingInFlight.current = false;
            }
        }

        void runSIWS();
    }, [connected, publicKey, signMessage, status]);

    // ── Step 1: wallet selection ─────────────────────────────────────────────
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
                setStatus((prev) => (prev === "connecting" ? "error" : prev));
                setErrorCode("WALLET_CONNECT_CANCELLED");
                signingInFlight.current = false;
            }
        },
        [select, connect, status],
    );

    // ── Wallet list (deduped) ────────────────────────────────────────────────
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

    const label = statusLabel(status, errorCode);

    // ── Ready state: show download link ─────────────────────────────────────
    if (status === "ready" && downloadUrl) {
        const expiresDate = new Date(downloadExpiresAt);
        const expiresMin = Math.max(
            0,
            Math.floor((expiresDate.getTime() - Date.now()) / 60_000),
        );
        return (
            <div>
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                    ACCESS GRANTED
                </p>
                <p className="font-body text-nd-body text-nd-text-secondary mb-nd-xl">
                    Your signed download link is ready. It expires in {expiresMin} minute
                    {expiresMin !== 1 ? "s" : ""}.
                </p>
                <a
                    href={downloadUrl}
                    className="inline-block font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-2xl py-nd-md hover:border-nd-border-visible transition-colors"
                    download
                >
                    DOWNLOAD APK →
                </a>
                <p className="font-mono text-nd-caption text-nd-text-disabled mt-nd-lg">
                    THIS LINK IS SINGLE-USE AND WALLET-BOUND.
                </p>
            </div>
        );
    }

    // ── Not allowed ──────────────────────────────────────────────────────────
    if (status === "not_allowed") {
        return (
            <div>
                <p className="font-mono text-nd-body text-nd-accent">
                    [ ACCESS DENIED ]
                </p>
                <p className="font-mono text-nd-caption text-nd-text-disabled mt-nd-sm">
                    Your wallet is not on the allowlist for this track, or the track is no longer available.
                </p>
            </div>
        );
    }

    // ── Pending / in-progress ────────────────────────────────────────────────
    if (status !== "idle" && status !== "error") {
        return (
            <div>
                <p className="font-mono text-nd-body text-nd-text-secondary">
                    {label}
                </p>
            </div>
        );
    }

    // ── Idle / error: show wallet list ───────────────────────────────────────
    return (
        <div>
            {label && (
                <p className="font-mono text-nd-body text-nd-accent mb-nd-lg">{label}</p>
            )}

            {availableWallets.length === 0 ? (
                <div>
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        NO WALLET DETECTED
                    </p>
                    <p className="font-mono text-nd-caption text-nd-text-disabled mt-nd-sm">
                        Install Backpack, Phantom, or another Solana wallet.
                    </p>
                </div>
            ) : (
                <div className="space-y-nd-sm">
                    {availableWallets.map((w) => (
                        <button
                            key={w.adapter.name}
                            onClick={() => void handleWalletSelect(w.adapter.name)}
                            className="w-full text-left border border-nd-border px-nd-lg py-nd-md hover:border-nd-border-visible transition-colors flex items-center gap-nd-md"
                        >
                            {w.adapter.icon && (
                                <img
                                    src={w.adapter.icon}
                                    alt={w.adapter.name}
                                    width={20}
                                    height={20}
                                    className="w-5 h-5"
                                />
                            )}
                            <span className="font-mono text-nd-label text-nd-text-primary uppercase tracking-[0.08em]">
                                {w.adapter.name}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
