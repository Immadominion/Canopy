import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { getSessionWallet } from "@/lib/auth/session";

/**
 * Dashboard layout — server component.
 *
 * Guards all /dashboard/* routes: unauthenticated requests are redirected to /sign-in.
 *
 * Nothing Design top navigation:
 * — CANOPY wordmark left
 * — Space Mono ALL CAPS nav links centre
 * — Truncated wallet address right (tertiary metadata)
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await getSessionWallet();
    if (!session) {
        redirect("/sign-in");
    }

    // Display the first 4 and last 4 chars of the wallet address.
    const addr = session.walletAddress;
    const walletDisplay = `${addr.slice(0, 4)}...${addr.slice(-4)}`;

    return (
        <div className="min-h-screen bg-nd-black flex flex-col">
            {/* ── Top nav bar ── */}
            <header className="border-b border-nd-border px-nd-xl py-nd-md flex items-center justify-between gap-nd-xl">
                {/* Left: wordmark + nav */}
                <div className="flex items-center gap-nd-xl">
                    <Link
                        href="/dashboard/apps"
                        className="font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] shrink-0"
                    >
                        CANOPY
                    </Link>
                    <DashboardNav />
                </div>

                {/* Right: wallet address + sign-out (tertiary metadata) */}
                <div className="flex items-center gap-nd-lg shrink-0">
                    <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        {walletDisplay}
                    </span>
                    <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]" aria-hidden>
                        /
                    </span>
                    <SignOutButton />
                </div>
            </header>

            {/* ── Page content ── */}
            <main className="flex-1 px-nd-xl py-nd-2xl">{children}</main>
        </div>
    );
}
