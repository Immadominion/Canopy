import Link from "next/link";
import type { Metadata } from "next";

import { DocsNav } from "@/components/docs/docs-nav";

export const metadata: Metadata = {
    title: "Docs — Canopy",
    description: "How to use Canopy: send analytics, upload builds, add testers, and share install links.",
    robots: { index: true, follow: true },
};

/**
 * /docs — public developer docs. Dark theme, plain English. A left nav plus a
 * shared typography wrapper so each page only writes h1/h2/p/ol/pre.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <main className="min-h-screen bg-nd-black">
            <div className="max-w-5xl mx-auto px-nd-xl py-nd-2xl md:flex md:gap-nd-2xl">
                <aside className="md:w-52 shrink-0 mb-nd-2xl md:mb-0">
                    <Link
                        href="/"
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                    >
                        ← CANOPY
                    </Link>
                    <p className="mt-nd-xl font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-md">
                        DOCS
                    </p>
                    <DocsNav />
                </aside>

                <article
                    className="flex-1 min-w-0 max-w-2xl font-body text-nd-body-sm text-nd-text-secondary leading-relaxed
                        [&_h1]:font-mono [&_h1]:text-nd-display-sm [&_h1]:text-nd-text-display [&_h1]:tracking-tight [&_h1]:mb-nd-md
                        [&_h2]:font-mono [&_h2]:text-nd-label [&_h2]:text-nd-text-primary [&_h2]:uppercase [&_h2]:tracking-[0.08em] [&_h2]:mt-nd-2xl [&_h2]:mb-nd-sm
                        [&_p]:mb-nd-md
                        [&_strong]:text-nd-text-primary
                        [&_code]:font-mono [&_code]:text-nd-text-primary
                        [&_a]:text-nd-text-primary [&_a]:underline hover:[&_a]:text-nd-brand-hover
                        [&_ol]:list-decimal [&_ol]:pl-nd-lg [&_ol]:space-y-nd-xs [&_ol]:mb-nd-md
                        [&_ul]:list-disc [&_ul]:pl-nd-lg [&_ul]:space-y-nd-xs [&_ul]:mb-nd-md
                        [&_pre]:bg-nd-surface [&_pre]:border [&_pre]:border-nd-border [&_pre]:rounded-nd-card-compact [&_pre]:p-nd-md [&_pre]:overflow-x-auto [&_pre]:my-nd-md [&_pre]:text-nd-caption [&_pre]:text-nd-text-secondary"
                >
                    {children}
                </article>
            </div>
        </main>
    );
}
