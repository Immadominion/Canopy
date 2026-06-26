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

/** Docs side-nav. Styling is passed in so the layout owns the (light) theme. */
export function DocsNav({ linkClass, activeClass }: { linkClass: string; activeClass: string }) {
    const pathname = usePathname();
    return (
        <nav>
            {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`${linkClass} ${active ? activeClass : ""}`}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
