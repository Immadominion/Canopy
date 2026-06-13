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

/**
 * /dashboard/billing — Billing plan overview and Stripe portal access.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Current plan — dot-grid hero
 *   Layer 2 (Secondary): Subscription status + renewal date
 *   Layer 3 (Tertiary):  Plan feature summary + upgrade / manage links
 *
 * Accent red: current plan tier badge.
 */
export default async function BillingPage() {
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    const { data: org } = await admin
        .from("organizations")
        .select("name, plan, subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id")
        .eq("owner_id", publisher.id)
        .maybeSingle();

    // No organization yet → don't 404; guide the user to create one. Billing is
    // org-scoped (plans/subscriptions attach to an organization).
    if (!org) {
        return (
            <div className="max-w-3xl mx-auto">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    BILLING
                </p>
                <p className="font-body text-nd-body text-nd-text-secondary mb-nd-xl max-w-xl">
                    You&apos;re on the <span className="text-nd-text-primary">Free</span> plan.
                    Billing is managed per organization — create one to add teammates and unlock
                    paid plans.
                </p>
                <a
                    href="/dashboard/org/create"
                    className="inline-block font-mono text-nd-label text-nd-black bg-nd-text-display uppercase tracking-[0.08em] px-nd-lg py-nd-sm rounded-md"
                >
                    CREATE ORGANIZATION →
                </a>
            </div>
        );
    }

    const billing = org as OrgBilling;
    const isActive = billing.subscription_status === "active" || billing.subscription_status === "trialing";
    const cfg = getBillingConfig();

    return (
        <div className="min-h-full bg-black text-nd-text-primary">
            {/* ── dot-grid hero ──────────────────────────────────────────────────── */}
            <div
                className="relative border-b border-nd-border-subtle px-6 py-12"
                style={{
                    backgroundImage:
                        "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                }}
            >
                <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-nd-text-secondary mb-3">
                    Billing
                </p>

                <div className="flex items-end gap-4">
                    <h1 className="font-grotesk text-3xl font-semibold text-nd-text-primary">
                        {PLAN_LABELS[billing.plan]}
                    </h1>
                    {billing.subscription_status && (
                        <span
                            className={`font-mono text-[10px] tracking-[0.08em] uppercase border px-2 py-0.5 mb-1 ${isActive
                                    ? "border-nd-accent text-nd-accent"
                                    : "border-nd-border-visible text-nd-text-secondary"
                                }`}
                        >
                            {STATUS_LABEL[billing.subscription_status] ?? billing.subscription_status}
                        </span>
                    )}
                </div>

                {billing.current_period_end && (
                    <p className="mt-2 font-mono text-[11px] text-nd-text-tertiary">
                        {billing.cancel_at_period_end ? "Cancels" : "Renews"}{" "}
                        {formatDate(billing.current_period_end)}
                    </p>
                )}
            </div>

            <div className="px-6 py-8 max-w-2xl space-y-10">

                {/* ── plan summary ────────────────────────────────────────────────── */}
                <section>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary mb-4">
                        Plan features
                    </p>
                    <div className="border border-nd-border-subtle divide-y divide-nd-border-subtle">
                        {PLAN_FEATURES[billing.plan].map(({ feature, value }) => (
                            <div key={feature} className="flex items-center justify-between px-4 py-3">
                                <p className="font-mono text-xs text-nd-text-secondary">{feature}</p>
                                <p className="font-mono text-xs text-nd-text-primary">{value}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── upgrade / extend — on-chain USDC ────────────────────────────── */}
                <section className="space-y-3">
                    {!cfg ? (
                        <p className="font-mono text-xs text-nd-text-secondary">
                            On-chain billing isn&apos;t configured yet. Set CANOPY_MERCHANT_WALLET to
                            enable USDC subscriptions.
                        </p>
                    ) : billing.plan === "free" ? (
                        <div className="border border-nd-border-subtle p-4 space-y-5 rounded-lg">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary">
                                Upgrade — pay in USDC on Solana
                            </p>

                            <div className="space-y-2">
                                <p className="font-grotesk text-sm text-nd-text-primary">
                                    Pro — ${priceUsd("pro", "monthly")} / mo
                                </p>
                                <p className="font-grotesk text-xs text-nd-text-secondary">
                                    10M events, 5 team members, funnels &amp; retention, remote config.
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

                            <div className="space-y-2 pt-4 border-t border-nd-border-subtle">
                                <p className="font-grotesk text-sm text-nd-text-primary">
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

                            <p className="font-mono text-[10px] text-nd-text-tertiary">
                                A one-time USDC payment extends your plan 30 days. No auto-renew —
                                pay again to extend.
                            </p>
                        </div>
                    ) : (
                        <div className="border border-nd-border-subtle p-4 space-y-3 rounded-lg">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary">
                                Extend your {PLAN_LABELS[billing.plan]} plan — USDC
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
