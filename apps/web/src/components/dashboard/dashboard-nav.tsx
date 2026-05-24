"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
    { href: "/dashboard/apps", label: "APPS" },
    { href: "/dashboard/analytics", label: "ANALYTICS" },
    { href: "/dashboard/settings", label: "SETTINGS" },
] as const;

/**
 * Top navigation links for the dashboard.
 * Client component so we can read `usePathname()` for active state.
 * Nothing Design: Space Mono, ALL CAPS, active = --text-display, inactive = --text-disabled.
 */
export function DashboardNav() {
    const pathname = usePathname();

    return (
        <nav className="flex items-center gap-nd-xl" aria-label="Dashboard navigation">
            {NAV_ITEMS.map(({ href, label }) => {
                const isActive = pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`font-mono text-nd-label uppercase tracking-[0.08em] transition-colors ${isActive
                                ? "text-nd-text-display"
                                : "text-nd-text-disabled hover:text-nd-text-secondary"
                            }`}
                        aria-current={isActive ? "page" : undefined}
                    >
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
