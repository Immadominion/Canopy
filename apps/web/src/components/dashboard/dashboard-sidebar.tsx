"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Package, ChartLine, Wrench, GearSix, SignOut, Wallet, Users } from "@/components/ui/icon";

const NAV_ITEMS = [
    { href: "/dashboard/apps", label: "Apps", Icon: Package },
    { href: "/dashboard/tester-groups", label: "Tester Groups", Icon: Users },
    { href: "/dashboard/analytics", label: "Analytics", Icon: ChartLine },
    { href: "/dashboard/tools", label: "Tools", Icon: Wrench },
    { href: "/dashboard/settings", label: "Settings", Icon: GearSix },
] as const;

/**
 * Left sidebar navigation.
 *
 * Collapsed to a 64px icon rail by default; expands to 248px **on hover**, and
 * stays expanded on wide screens (`xl`, ≥1280px). The collapse/expand is pure
 * CSS (`group` + `group-hover:` + `xl:`), so there's no hydration flash and it
 * works without JS. Labels clip via the rail's `overflow-hidden`.
 */
export function DashboardSidebar({ walletDisplay }: { walletDisplay: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const [signingOut, setSigningOut] = useState(false);

    // Visible only when expanded (hover or xl). `group` lives on the <aside>.
    const labelCls = "whitespace-nowrap opacity-0 group-hover:opacity-100 xl:opacity-100 transition-opacity";

    async function handleSignOut() {
        if (signingOut) return;
        setSigningOut(true);
        try {
            await fetch("/api/v1/auth/sign-out", { method: "POST" });
        } finally {
            router.push("/sign-in");
            router.refresh();
        }
    }

    return (
        <aside
            className="group fixed left-0 top-0 z-40 h-dvh w-16 hover:w-[248px] xl:w-[248px] overflow-hidden bg-nd-shell flex flex-col transition-[width] duration-200 ease-out"
            aria-label="Sidebar"
        >
            {/* Brand */}
            <Link href="/dashboard/apps" className="flex items-center h-16 shrink-0">
                <span className="w-16 shrink-0 flex items-center justify-center">
                    <img src="/canopy-mark.png" alt="Canopy" width={30} height={30} className="object-contain" />
                </span>
                <span className={`font-body font-semibold text-nd-body text-nd-text-display tracking-tight ${labelCls}`}>
                    Canopy
                </span>
            </Link>

            {/* Nav */}
            <nav className="flex-1 mt-nd-sm flex flex-col gap-nd-2xs" aria-label="Primary">
                {NAV_ITEMS.map(({ href, label, Icon }) => {
                    const isActive = pathname.startsWith(href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            aria-current={isActive ? "page" : undefined}
                            title={label}
                            className={`relative flex items-center h-11 mx-nd-sm rounded-nd-card-compact transition-colors ${
                                isActive
                                    ? "bg-white/[0.07] text-nd-brand-hover"
                                    : "text-nd-text-secondary hover:text-nd-text-primary hover:bg-white/[0.04]"
                            }`}
                        >
                            {isActive && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-nd-brand" />
                            )}
                            <span className="w-12 shrink-0 flex items-center justify-center">
                                <Icon size={20} weight={isActive ? "fill" : "regular"} />
                            </span>
                            <span className={`text-nd-body-sm font-medium ${labelCls}`}>{label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Footer: wallet + sign-out */}
            <div className="shrink-0 border-t border-nd-border py-nd-sm">
                <div className="flex items-center h-11 text-nd-text-secondary" title={walletDisplay}>
                    <span className="w-16 shrink-0 flex items-center justify-center">
                        <Wallet size={18} />
                    </span>
                    <span className={`font-mono text-nd-caption ${labelCls}`}>{walletDisplay}</span>
                </div>
                <button
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    title="Sign out"
                    className="w-full flex items-center h-11 text-nd-text-secondary hover:text-nd-text-primary transition-colors disabled:opacity-50"
                >
                    <span className="w-16 shrink-0 flex items-center justify-center">
                        <SignOut size={18} />
                    </span>
                    <span className={`text-nd-body-sm ${labelCls}`}>
                        {signingOut ? "Signing out…" : "Sign out"}
                    </span>
                </button>
            </div>
        </aside>
    );
}
