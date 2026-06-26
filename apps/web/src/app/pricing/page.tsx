import Link from "next/link";
import type { Metadata } from "next";

import { PLAN_PRICES } from "@/lib/billing/plans";

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

/**
 * /pricing — public pricing page. Reads prices from the billing lib so they
 * never drift from what the app actually charges.
 */
export default function PricingPage() {
    return (
        <main className="min-h-screen bg-nd-black px-nd-xl py-nd-2xl">
            <div className="max-w-4xl mx-auto">
                <Link
                    href="/"
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    ← CANOPY
                </Link>

                <header className="mt-nd-xl mb-nd-2xl">
                    <h1 className="font-mono text-nd-display-sm text-nd-text-display tracking-tight">
                        Pricing
                    </h1>
                    <p className="mt-nd-md font-body text-nd-body text-nd-text-secondary max-w-xl leading-relaxed">
                        The beta side is free. You only pay if you want deeper analytics, a bigger
                        team, or longer history. You pay in USDC on Solana, so there is no card and no
                        business account needed.
                    </p>
                </header>

                <div className="grid gap-nd-lg md:grid-cols-3">
                    {TIERS.map((tier) => (
                        <div
                            key={tier.name}
                            className={`flex flex-col rounded-nd-card border p-nd-lg ${
                                tier.highlight ? "border-nd-brand" : "border-nd-border"
                            }`}
                        >
                            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                {tier.name}
                            </p>
                            <p className="mt-nd-md font-mono text-nd-display-sm text-nd-text-display">
                                {tier.price}
                            </p>
                            <p className="mt-nd-2xs font-body text-nd-caption text-nd-text-secondary">
                                {tier.sub}
                            </p>

                            <ul className="mt-nd-lg flex-1 space-y-nd-sm">
                                {tier.features.map((f) => (
                                    <li
                                        key={f}
                                        className="font-body text-nd-body-sm text-nd-text-secondary leading-snug"
                                    >
                                        <span className="text-nd-brand-hover">+ </span>
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={tier.cta.href}
                                className={`mt-nd-lg block text-center font-mono text-nd-label uppercase tracking-[0.08em] px-nd-lg py-nd-sm rounded-nd-card-compact transition-colors ${
                                    tier.highlight
                                        ? "bg-nd-brand text-nd-on-brand hover:bg-nd-brand-hover"
                                        : "border border-nd-border text-nd-text-primary hover:border-nd-border-visible"
                                }`}
                            >
                                {tier.cta.label}
                            </Link>
                        </div>
                    ))}
                </div>

                <p className="mt-nd-2xl font-body text-nd-caption text-nd-text-disabled max-w-xl leading-relaxed">
                    Paid plans do not auto-renew. A payment extends your plan by the period you bought,
                    and you pay again to extend. When a plan lapses, you drop back to Free until you
                    pay again. The 200 testers per build cap applies to every plan.
                </p>

                <p className="mt-nd-lg font-mono text-nd-caption text-nd-text-disabled">
                    Read the{" "}
                    <Link href="/docs" className="text-nd-text-secondary underline hover:text-nd-text-primary">
                        docs
                    </Link>{" "}
                    to get started.
                </p>
            </div>
        </main>
    );
}
