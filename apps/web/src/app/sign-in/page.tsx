import Link from "next/link";
import type { Metadata } from "next";

import { SIWSWalletConnect } from "@/components/auth/siws-wallet-connect";

export const metadata: Metadata = {
    title: "Sign In",
};

/**
 * Sign-in — brand mark + wallet connect in a centered card.
 */
export default function SignInPage() {
    return (
        <main className="min-h-screen bg-nd-black flex items-center justify-center relative overflow-hidden px-nd-lg">
            {/* Subtle teal glow behind the card */}
            <div
                className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full opacity-[0.08] blur-3xl"
                style={{ background: "radial-gradient(circle, #14B8A6 0%, transparent 70%)" }}
                aria-hidden="true"
            />

            <div className="relative z-10 w-full max-w-sm text-center">
                {/* Brand */}
                <div className="flex flex-col items-center mb-nd-xl">
                    <img src="/canopy-mark.png" alt="Canopy" width={64} height={64} className="object-contain mb-nd-lg" />
                    <h1 className="font-body text-nd-display-md font-extrabold text-nd-text-display tracking-tight">
                        Canopy
                    </h1>
                    <p className="mt-nd-sm text-nd-body-sm text-nd-text-secondary">
                        Developer infrastructure for Solana Mobile.
                    </p>
                </div>

                {/* Wallet connect card */}
                <div className="card p-nd-lg">
                    <p className="text-nd-body-sm text-nd-text-secondary mb-nd-lg">
                        Connect your wallet to continue
                    </p>
                    <SIWSWalletConnect />
                </div>

                <p className="mt-nd-xl text-nd-caption text-nd-text-secondary leading-relaxed">
                    By connecting your wallet you agree to Canopy&apos;s{" "}
                    <Link href="/terms" className="text-nd-text-secondary underline hover:text-nd-text-primary transition-colors">
                        Terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="text-nd-text-secondary underline hover:text-nd-text-primary transition-colors">
                        Privacy Policy
                    </Link>
                    .
                </p>
            </div>
        </main>
    );
}
