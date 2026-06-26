import type { Metadata } from "next";

import landing from "@/components/landing/landing.module.css";
import { DocsNav } from "@/components/docs/docs-nav";
import { MarketingNav } from "@/components/marketing/marketing-nav";

import styles from "./docs.module.css";

export const metadata: Metadata = {
    title: "Docs — Canopy",
    description: "How to use Canopy: send analytics, upload builds, add testers, and share install links.",
    robots: { index: true, follow: true },
};

/** /docs — public developer docs, light landing theme. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={`${landing["page"]} landing-light`}>
            <MarketingNav />

            <div className={styles["inner"]}>
                <aside className={styles["side"]}>
                    <p className={styles["sideLabel"]}>Docs</p>
                    <DocsNav
                        linkClass={styles["navLink"] ?? ""}
                        activeClass={styles["navLinkActive"] ?? ""}
                    />
                </aside>

                <article className={styles["content"]}>{children}</article>
            </div>
        </div>
    );
}
