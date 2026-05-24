import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/billing/portal-session
 *
 * Creates a Stripe Customer Portal session for the signed-in publisher's org.
 * If the org has no Stripe customer yet, creates one first.
 * Returns `{ url }` — the client should redirect to it.
 */
export async function POST(): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const admin = createSupabaseAdminClient();

    const { data: org } = await admin
        .from("organizations")
        .select("id, name, stripe_customer_id")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (!org) {
        return apiError("ORG_NOT_FOUND", "Create an organisation before managing billing", 404);
    }

    const stripe = getStripe();
    let customerId = org.stripe_customer_id;

    // Create a Stripe customer if this org doesn't have one yet.
    if (!customerId) {
        const customer = await stripe.customers.create({
            name: org.name,
            metadata: { org_id: org.id, publisher_id: auth.publisher.id },
        });
        customerId = customer.id;

        await admin
            .from("organizations")
            .update({ stripe_customer_id: customerId })
            .eq("id", org.id);
    }

    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });

    return NextResponse.json({ url: session.url });
}
