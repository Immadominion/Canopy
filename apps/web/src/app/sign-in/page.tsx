import type { Metadata } from "next";

import { SIWSWalletConnect } from "@/components/auth/siws-wallet-connect";

export const metadata: Metadata = {
    title: "Sign In",
};

/**
 * Sign-in page — Nothing Design:
 *
 * Layer 1 (Primary):   "CANOPY" — Doto display font, the one pattern break (dot-grid bg)
 * Layer 2 (Secondary): Tagline — Space Grotesk, --text-secondary
 * Layer 3 (Tertiary):  Wallet list — Space Mono, ALL CAPS, interactive
 *
 * One accent red per screen: used on the → arrow hover and error state.
 * No gradients, no shadows, no skeleton screens, no toast.
 */
export default function SignInPage() {
    return (
        <div className="min-h-screen bg-nd-black flex items-center justify-center relative overflow-hidden">
            {/* Dot-grid hero layer — the one pattern break for this screen */}
            <div
                className="absolute inset-0 bg-nd-dot-grid-subtle bg-nd-dot-12 opacity-40"
                aria-hidden="true"
            />

            {/* Content column */}
            <div className="relative z-10 w-full max-w-sm px-nd-xl py-nd-4xl">
                {/* ── Layer 1: Primary — CANOPY wordmark ── */}
                <div className="mb-nd-3xl">
                    <h1 className="font-display text-nd-display-xl text-nd-text-display leading-none tracking-tighter select-none">
                        CANOPY
                    </h1>
                </div>

                {/* ── Layer 2: Secondary — Tagline ── */}
                <p className="font-body text-nd-body text-nd-text-secondary mb-nd-2xl leading-relaxed">
                    Developer infrastructure for Solana Mobile apps.
                </p>

                {/* Separator */}
                <div className="border-t border-nd-border mb-nd-xl" />

                {/* ── Layer 3: Tertiary — Wallet connect ── */}
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    CONNECT YOUR WALLET TO CONTINUE
                </p>

                <SIWSWalletConnect />
            </div>
        </div>
    );
}
