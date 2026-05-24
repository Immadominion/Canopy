import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { StripeSubscriptionStatus } from "@canopy/types";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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

    if (!org) notFound();

    const billing = org as OrgBilling;
    const isActive = billing.subscription_status === "active" || billing.subscription_status === "trialing";
    const hasBilling = !!billing.stripe_customer_id;

    return (
        <div className="min-h-screen bg-black text-nd-text-primary">
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

                {/* ── manage / upgrade ────────────────────────────────────────────── */}
                <section className="space-y-3">
                    {hasBilling && (
                        <form action="/api/v1/billing/portal-session" method="POST">
                            <button
                                type="submit"
                                className="font-mono text-[10px] uppercase tracking-[0.08em] border border-nd-border-visible px-4 py-2 text-nd-text-secondary hover:border-nd-text-secondary transition-colors"
                            >
                                Manage billing &amp; invoices →
                            </button>
                        </form>
                    )}

                    {billing.plan === "free" && (
                        <div className="border border-nd-border-subtle p-4 space-y-3">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary">
                                Upgrade to Pro
                            </p>
                            <p className="font-grotesk text-sm text-nd-text-secondary">
                                Unlimited events, up to 5 team members, advanced analytics.
                            </p>
                            <form action="/api/v1/billing/portal-session" method="POST">
                                <button
                                    type="submit"
                                    className="font-mono text-[10px] uppercase tracking-[0.08em] bg-nd-accent text-white px-4 py-2"
                                >
                                    Upgrade →
                                </button>
                            </form>
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
        { feature: "Events / month", value: "500,000" },
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
