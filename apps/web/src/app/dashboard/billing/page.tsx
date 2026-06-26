import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { StripeSubscriptionStatus } from "@canopy/types";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { SubscribeWithUsdc } from "@/components/billing/subscribe-with-usdc";
import { getBillingConfig } from "@/lib/billing/provider";
import { priceUsd } from "@/lib/billing/plans";

export const metadata: Metadata = {
    title: "Billing",
};

interface OrgBilling {
    name: string;
    plan: "free" | "pro" | "enterprise";
    subscription_status: StripeSubscriptionStatus | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
}

const PLAN_LABELS: Record<"free" | "pro" | "enterprise", string> = {
    free: "Free",
    pro: "Pro",
    enterprise: "Enterprise",
};

const STATUS_LABEL: Partial<Record<StripeSubscriptionStatus, string>> = {
    active: "Active",
    trialing: "Trial",
    past_due: "Past due",
    canceled: "Cancelled",
    unpaid: "Unpaid",
    paused: "Paused",
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** /dashboard/billing — plan overview + USDC upgrade/extend. */
export default async function BillingPage() {
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    const { data: org } = await admin
        .from("organizations")
        .select("name, plan, subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id")
        .eq("owner_id", publisher.id)
        .maybeSingle();

    // No organization yet → guide the user to create one (billing is org-scoped).
    if (!org) {
        return (
            <div className="max-w-3xl mx-auto">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    BILLING
                </p>
                <h1 className="font-body text-nd-display-md text-nd-text-display leading-tight">Free plan</h1>
                <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-md mb-nd-xl max-w-xl leading-relaxed">
                    Billing is per organization. Create one to add teammates and move to a paid plan.
                </p>
                <Link
                    href="/dashboard/org/create"
                    className="inline-block font-mono text-nd-label uppercase tracking-[0.08em] bg-nd-brand text-nd-on-brand px-nd-lg py-nd-sm rounded-nd-card-compact hover:bg-nd-brand-hover transition-colors"
                >
                    CREATE ORGANIZATION →
                </Link>
            </div>
        );
    }

    const billing = org as OrgBilling;
    const isActive = billing.subscription_status === "active" || billing.subscription_status === "trialing";
    const cfg = getBillingConfig();

    return (
        <div className="max-w-3xl mx-auto">
            <header className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    BILLING
                </p>
                <div className="flex items-end gap-nd-md flex-wrap">
                    <h1 className="font-body text-nd-display-md text-nd-text-display leading-tight">
                        {PLAN_LABELS[billing.plan]} plan
                    </h1>
                    {billing.subscription_status && (
                        <span
                            className={`font-mono text-nd-label uppercase tracking-[0.08em] border px-nd-sm py-0.5 rounded-nd-card-compact mb-1 ${
                                isActive
                                    ? "border-nd-brand text-nd-brand-hover"
                                    : "border-nd-border text-nd-text-secondary"
                            }`}
                        >
                            {STATUS_LABEL[billing.subscription_status] ?? billing.subscription_status}
                        </span>
                    )}
                </div>
                {billing.current_period_end && (
                    <p className="font-mono text-nd-caption text-nd-text-disabled mt-nd-sm">
                        {billing.cancel_at_period_end ? "Cancels" : "Renews"}{" "}
                        {formatDate(billing.current_period_end)}
                    </p>
                )}
            </header>

            {/* Plan features */}
            <section className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-md">
                    PLAN FEATURES
                </p>
                <div className="border border-nd-border rounded-nd-card overflow-hidden">
                    {PLAN_FEATURES[billing.plan].map(({ feature, value }, i) => (
                        <div
                            key={feature}
                            className={`flex items-center justify-between px-nd-md py-nd-sm ${
                                i > 0 ? "border-t border-nd-border" : ""
                            }`}
                        >
                            <p className="font-body text-nd-body-sm text-nd-text-secondary">{feature}</p>
                            <p className="font-mono text-nd-caption text-nd-text-primary">{value}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Upgrade / extend — on-chain USDC */}
            <section className="space-y-nd-md">
                {!cfg ? (
                    <p className="font-mono text-nd-caption text-nd-text-secondary">
                        On-chain billing isn&apos;t configured yet. Set CANOPY_MERCHANT_WALLET to enable
                        USDC subscriptions.
                    </p>
                ) : billing.plan === "free" ? (
                    <div className="border border-nd-border rounded-nd-card p-nd-lg space-y-nd-lg">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            UPGRADE — PAY IN USDC ON SOLANA
                        </p>

                        <div className="space-y-nd-sm">
                            <p className="font-body text-nd-body-sm text-nd-text-primary font-medium">
                                Pro — ${priceUsd("pro", "monthly")} / mo
                            </p>
                            <p className="font-body text-nd-caption text-nd-text-secondary">
                                10M events, 5 team members, funnels and retention, remote config.
                            </p>
                            <SubscribeWithUsdc
                                plan="pro"
                                interval="monthly"
                                priceUsd={priceUsd("pro", "monthly")}
                                merchantWallet={cfg.merchantWallet.toBase58()}
                                usdcMint={cfg.usdcMint.toBase58()}
                                rpcUrl={cfg.rpcUrl}
                            />
                        </div>

                        <div className="space-y-nd-sm pt-nd-md border-t border-nd-border">
                            <p className="font-body text-nd-body-sm text-nd-text-primary font-medium">
                                Enterprise — ${priceUsd("enterprise", "monthly")} / mo
                            </p>
                            <SubscribeWithUsdc
                                plan="enterprise"
                                interval="monthly"
                                priceUsd={priceUsd("enterprise", "monthly")}
                                merchantWallet={cfg.merchantWallet.toBase58()}
                                usdcMint={cfg.usdcMint.toBase58()}
                                rpcUrl={cfg.rpcUrl}
                            />
                        </div>

                        <p className="font-mono text-nd-label text-nd-text-disabled">
                            A one-time USDC payment extends your plan 30 days. No auto-renew, pay again to
                            extend.
                        </p>
                    </div>
                ) : (
                    <div className="border border-nd-border rounded-nd-card p-nd-lg space-y-nd-md">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            EXTEND YOUR {PLAN_LABELS[billing.plan].toUpperCase()} PLAN — USDC
                        </p>
                        <SubscribeWithUsdc
                            plan={billing.plan}
                            interval="monthly"
                            priceUsd={priceUsd(billing.plan, "monthly")}
                            merchantWallet={cfg.merchantWallet.toBase58()}
                            usdcMint={cfg.usdcMint.toBase58()}
                            rpcUrl={cfg.rpcUrl}
                        />
                    </div>
                )}
            </section>
        </div>
    );
}

// ─── plan feature table ────────────────────────────────────────────────────────
const PLAN_FEATURES: Record<"free" | "pro" | "enterprise", { feature: string; value: string }[]> = {
    free: [
        { feature: "Events / month", value: "1,000,000" },
        { feature: "Beta testers", value: "Up to 200 (hard cap)" },
        { feature: "Team members", value: "1 (owner only)" },
        { feature: "Crash reports", value: "1,000 / month" },
        { feature: "Data retention", value: "30 days" },
    ],
    pro: [
        { feature: "Events / month", value: "10,000,000" },
        { feature: "Beta testers", value: "Up to 200 (hard cap)" },
        { feature: "Team members", value: "5" },
        { feature: "Crash reports", value: "Unlimited" },
        { feature: "Data retention", value: "90 days" },
    ],
    enterprise: [
        { feature: "Events / month", value: "Unlimited" },
        { feature: "Beta testers", value: "Up to 200 (hard cap)" },
        { feature: "Team members", value: "Unlimited" },
        { feature: "Crash reports", value: "Unlimited" },
        { feature: "Data retention", value: "1 year" },
    ],
};
