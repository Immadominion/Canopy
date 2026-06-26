"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
    { href: "/docs", label: "Overview" },
    { href: "/docs/analytics", label: "Send analytics" },
    { href: "/docs/upload", label: "Upload a build" },
    { href: "/docs/testers", label: "Add testers and share" },
    { href: "/docs/installing", label: "How testers install" },
] as const;

export function DocsNav() {
    const pathname = usePathname();
    return (
        <nav className="flex flex-col gap-nd-2xs">
            {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`font-body text-nd-body-sm py-nd-2xs transition-colors ${
                            active
                                ? "text-nd-brand-hover"
                                : "text-nd-text-secondary hover:text-nd-text-primary"
                        }`}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
