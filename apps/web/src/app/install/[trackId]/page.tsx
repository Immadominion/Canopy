import type { Metadata } from "next";

import { getSessionWallet } from "@/lib/auth/session";
import { SIWSInstallFlow } from "@/components/install/siws-install-flow";
import { OpenInCanopy } from "@/components/install/open-in-canopy";

export const metadata: Metadata = {
    title: "Install Beta Build",
};

interface PageProps {
    params: Promise<{ trackId: string }>;
}

/**
 * /install/[trackId] — tester APK download page.
 *
 * Invariant 5: never reveal track existence to unauthenticated requests.
 * The page shows a wallet sign-in flow first; backend checks allowlist.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   CANOPY wordmark + "BETA INSTALL" heading
 *   Layer 2 (Secondary): SIWS wallet connect / download button
 *   Layer 3 (Tertiary):  Explanatory labels, expiry notice
 *
 * One accent red: only for ACCESS DENIED state.
 */
export default async function InstallPage({ params }: PageProps) {
    const { trackId } = await params;

    // Detect whether the visitor already has a valid session (skip re-auth).
    // Do not expose any track details before auth — Invariant 5.
    const session = await getSessionWallet();
    const isAuthenticated = session !== null;

    return (
        <div className="min-h-screen bg-nd-black flex items-start justify-center px-nd-lg pt-[15vh]">
            {/* Dot-grid pattern break */}
            <div
                className="fixed inset-0 bg-nd-dot-grid-subtle bg-nd-dot-12 opacity-30 pointer-events-none"
                aria-hidden="true"
            />

            <div className="relative z-10 w-full max-w-sm">
                {/* ── Layer 1: CANOPY wordmark ── */}
                <div className="mb-nd-2xl">
                    <p className="font-display text-nd-display-xl text-nd-text-display tracking-tighter leading-none">
                        CANOPY
                    </p>
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                        BETA INSTALL
                    </p>
                </div>

                {/* ── Layer 2a: Primary path — the trusted Canopy app ── */}
                <div className="mb-nd-2xl">
                    <OpenInCanopy trackId={trackId} />
                </div>

                {/* ── Layer 2b: Advanced — direct, wallet-bound web download ── */}
                <details className="mb-nd-2xl group">
                    <summary className="cursor-pointer list-none font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors">
                        ADVANCED: DIRECT APK DOWNLOAD ▾
                    </summary>
                    <div className="mt-nd-lg border-l border-nd-border pl-nd-lg">
                        <p className="font-mono text-nd-caption text-nd-accent uppercase tracking-[0.06em] mb-nd-md leading-relaxed">
                            ONLY INSTALL APKS YOU TRUST. THE DOWNLOADED FILE IS NAMED BY ITS
                            SHA-256 — VERIFY IT MATCHES THE BUILD&apos;S FINGERPRINT BEFORE
                            INSTALLING. PREFER THE CANOPY APP ABOVE, WHICH VERIFIES AUTOMATICALLY.
                        </p>
                        {!isAuthenticated && (
                            <p className="font-body text-nd-body-sm text-nd-text-secondary mb-nd-xl">
                                Connect your Solana wallet to verify your tester access.
                            </p>
                        )}
                        <SIWSInstallFlow trackId={trackId} isAuthenticated={isAuthenticated} />
                    </div>
                </details>

                {/* ── Layer 3: Security notices ── */}
                <div className="border-t border-nd-border pt-nd-xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-sm">
                        SECURITY
                    </p>
                    <p className="font-mono text-nd-caption text-nd-text-disabled leading-relaxed">
                        DISTRIBUTION IS ALLOWLIST-ONLY. SIGNED URLS ARE WALLET-BOUND AND
                        EXPIRE IN 15 MINUTES. THIS BUILD IS NOT PUBLISHED TO THE DAPP STORE.
                    </p>
                </div>
            </div>
        </div>
    );
}
