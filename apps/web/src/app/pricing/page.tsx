import Link from "next/link";
import type { Metadata } from "next";

import landing from "@/components/landing/landing.module.css";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { PLAN_PRICES } from "@/lib/billing/plans";

import styles from "./pricing.module.css";

export const metadata: Metadata = {
    title: "Pricing — Canopy",
    description: "Simple, cheap pricing. The beta side is free. Pay in USDC on Solana for more analytics.",
    robots: { index: true, follow: true },
};

interface Tier {
    name: string;
    price: string;
    sub: string;
    features: string[];
    cta: { label: string; href: string };
    highlight: boolean;
}

const TIERS: Tier[] = [
    {
        name: "Free",
        price: "$0",
        sub: "Always free",
        features: [
            "Unlimited beta builds and testers (up to 200 per build)",
            "Verified, allowlisted installs",
            "1 million analytics events a month",
            "1 team member",
            "3 API keys",
            "30 days of analytics history",
            "Crash reports",
        ],
        cta: { label: "Start free", href: "/sign-in" },
        highlight: false,
    },
    {
        name: "Pro",
        price: `$${String(PLAN_PRICES.pro.monthlyUsd)}`,
        sub: `per month, or $${String(PLAN_PRICES.pro.annualUsd)} a year`,
        features: [
            "Everything in Free",
            "10 million events a month",
            "5 team members",
            "20 API keys",
            "90 days of history",
            "Funnels and retention",
            "Remote Config",
        ],
        cta: { label: "Get Pro", href: "/dashboard/billing" },
        highlight: true,
    },
    {
        name: "Enterprise",
        price: `$${String(PLAN_PRICES.enterprise.monthlyUsd)}`,
        sub: `per month, or $${String(PLAN_PRICES.enterprise.annualUsd)} a year`,
        features: [
            "Everything in Pro",
            "Unlimited events",
            "Unlimited team members",
            "Unlimited API keys",
            "1 year of history",
        ],
        cta: { label: "Get Enterprise", href: "/dashboard/billing" },
        highlight: false,
    },
];

/** /pricing — public marketing page, light landing theme. */
export default function PricingPage() {
    return (
        <div className={`${landing["page"]} landing-light`}>
            <MarketingNav />

            <main className={styles["root"]}>
                <div className={styles["hero"]}>
                    <h1 className={styles["title"]}>Pricing</h1>
                    <p className={styles["sub"]}>
                        The beta side is free. Pay only for deeper analytics, a bigger team, or longer
                        history. You pay in USDC on Solana, so there is no card and no business account
                        needed.
                    </p>
                </div>

                <div className={styles["grid"]}>
                    {TIERS.map((tier) => (
                        <div
                            key={tier.name}
                            className={`${styles["card"]} ${tier.highlight ? styles["cardHi"] : ""}`}
                        >
                            <span className={styles["tier"]}>{tier.name}</span>
                            <p className={styles["price"]}>{tier.price}</p>
                            <p className={styles["priceSub"]}>{tier.sub}</p>

                            <ul className={styles["features"]}>
                                {tier.features.map((f) => (
                                    <li key={f}>
                                        <span className={styles["check"]}>✓</span>
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={tier.cta.href}
                                className={`${styles["cta"]} ${tier.highlight ? styles["ctaHi"] : ""}`}
                            >
                                {tier.cta.label}
                            </Link>
                        </div>
                    ))}
                </div>

                <p className={styles["note"]}>
                    Paid plans do not auto-renew. A payment extends your plan, and you pay again to
                    extend. When a plan lapses you drop back to Free. The 200 testers per build cap
                    applies to every plan. Read the <Link href="/docs">docs</Link> to get started.
                </p>
            </main>
        </div>
    );
}
