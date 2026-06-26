import Link from "next/link";

import landing from "@/components/landing/landing.module.css";

/**
 * The landing's floating pill nav, reused on marketing sub-pages (pricing,
 * docs) so they share the exact same chrome. Reuses the landing CSS module
 * directly, so there is no second copy of the nav styles to drift.
 */
export function MarketingNav() {
    return (
        <nav className={landing["nav"]}>
            <Link className={landing["brand"]} href="/">
                <img
                    src="/canopy-mark.png"
                    alt="Canopy"
                    width={34}
                    height={34}
                    className={landing["brandMark"]}
                />
                <span className={landing["brandWord"]}>Canopy</span>
            </Link>
            <div className={landing["navRight"]}>
                <Link className={`${landing["navLink"]} ${landing["hideSm"]}`} href="/#how">
                    How it works
                </Link>
                <Link className={`${landing["navLink"]} ${landing["hideSm"]}`} href="/#solutions">
                    Product
                </Link>
                <Link className={`${landing["navLink"]} ${landing["hideSm"]}`} href="/pricing">
                    Pricing
                </Link>
                <Link className={`${landing["navLink"]} ${landing["hideSm"]}`} href="/docs">
                    Docs
                </Link>
                <Link className={landing["navCta"]} href="/sign-in">
                    Sign in
                </Link>
            </div>
        </nav>
    );
}
