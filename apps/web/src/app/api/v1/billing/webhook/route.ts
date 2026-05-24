import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { apiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/billing/webhook
 *
 * Handles Stripe webhook events for subscription lifecycle management.
 *
 * Security:
 * - Signature verified using STRIPE_WEBHOOK_SECRET (Stripe-Signature header).
 * - Raw body is read before any parsing — do not use request.json().
 *
 * Handled events:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_failed
 */
export async function POST(request: Request): Promise<NextResponse> {
    const stripe = getStripe();
    const sig = (await headers()).get("stripe-signature");

    if (!sig) {
        return apiError("MISSING_SIGNATURE", "Missing Stripe-Signature header", 400);
    }

    const rawBody = await request.text();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[billing/webhook] signature verification failed", message);
        return apiError("INVALID_SIGNATURE", "Webhook signature verification failed", 400);
    }

    const admin = createSupabaseAdminClient();

    try {
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const sub = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpsert(admin, sub);
                break;
            }
            case "customer.subscription.deleted": {
                const sub = event.data.object as Stripe.Subscription;
                await handleSubscriptionDeleted(admin, sub);
                break;
            }
            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentFailed(admin, invoice);
                break;
            }
            default:
                // Ignore unhandled event types — return 200 to acknowledge receipt.
                break;
        }
    } catch (err) {
        console.error("[billing/webhook] handler error", { type: event.type, err });
        // Return 500 so Stripe retries the webhook.
        return NextResponse.json({ error: "Internal handler error" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}

// ─── helpers ──────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function handleSubscriptionUpsert(admin: AdminClient, sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const priceId = sub.items.data[0]?.price.id ?? null;

    const plan = resolvePlan(priceId);
    // In Stripe SDK v22, current_period_end moved from Subscription to SubscriptionItem
    const periodEnd = sub.items.data[0]?.current_period_end;
    const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

    await admin
        .from("organizations")
        .update({
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            subscription_status: sub.status,
            plan,
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: sub.cancel_at_period_end,
        })
        .eq("stripe_customer_id", customerId);
}

async function handleSubscriptionDeleted(admin: AdminClient, sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    await admin
        .from("organizations")
        .update({
            stripe_subscription_id: null,
            stripe_price_id: null,
            subscription_status: "canceled",
            plan: "free",
            current_period_end: null,
            cancel_at_period_end: false,
        })
        .eq("stripe_customer_id", customerId);
}

async function handlePaymentFailed(admin: AdminClient, invoice: Stripe.Invoice): Promise<void> {
    // In Stripe SDK v22, subscription is in parent.subscription_details.subscription
    const parent = invoice.parent;
    const hasSubscription =
        parent?.type === "subscription_details" && parent.subscription_details?.subscription;
    if (!hasSubscription) return;

    const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
    if (!customerId) return;

    await admin
        .from("organizations")
        .update({ subscription_status: "past_due" })
        .eq("stripe_customer_id", customerId);
}

/**
 * Map a Stripe price ID to a Canopy plan tier.
 * Returns 'free' if the price ID is not recognised.
 */
function resolvePlan(priceId: string | null): "free" | "pro" | "enterprise" {
    if (!priceId) return "free";
    if (priceId === env.STRIPE_PRO_PRICE_ID) return "pro";
    if (priceId === env.STRIPE_ENTERPRISE_PRICE_ID) return "enterprise";
    return "free";
}
