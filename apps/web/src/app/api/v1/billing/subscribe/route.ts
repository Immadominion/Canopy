import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { getSessionWallet } from "@/lib/auth/session";
import { hashWalletAddress } from "@/lib/auth/siws";
import {
    PERIOD_DAYS,
    isBillingInterval,
    isPaidPlan,
    priceBaseUnits,
} from "@/lib/billing/plans";
import { billingEnabled, verifyUsdcPayment } from "@/lib/billing/provider";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const log = logger.child({ route: "POST /api/v1/billing/subscribe" });

const bodySchema = z.object({
    plan: z.string().refine(isPaidPlan, "plan must be 'pro' or 'enterprise'"),
    interval: z.string().refine(isBillingInterval, "interval must be 'monthly' or 'annual'"),
    signature: z.string().min(32).max(128), // base58 Solana tx signature
});

/**
 * POST /api/v1/billing/subscribe
 *
 * The org owner submits the signature of a USDC transfer they already sent to
 * the merchant wallet. We verify it on-chain, record it (unique signature =
 * idempotent), and extend the org's subscription period.
 */
export async function POST(request: Request): Promise<NextResponse> {
    if (!billingEnabled()) {
        return apiError("BILLING_DISABLED", "On-chain billing is not configured", 503);
    }

    const session = await getSessionWallet();
    if (!session) return apiError("UNAUTHENTICATED", "Authentication required", 401);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fieldErrors: parsed.error.flatten().fieldErrors,
        });
    }
    const { plan, interval, signature } = parsed.data;

    const admin = createSupabaseAdminClient();

    // Only the org owner can subscribe their org.
    const { data: publisher } = await admin
        .from("publishers")
        .select("id")
        .eq("wallet_hash", session.walletHash)
        .maybeSingle();
    if (!publisher) return apiError("FORBIDDEN", "No publisher record", 403);

    const { data: org } = await admin
        .from("organizations")
        .select("id, current_period_end")
        .eq("owner_id", publisher.id)
        .maybeSingle();
    if (!org) return apiError("NO_ORGANIZATION", "Create an organization first", 409);

    // Idempotency: a signature can only be applied once.
    const { data: existing } = await admin
        .from("billing_payments")
        .select("id")
        .eq("tx_signature", signature)
        .maybeSingle();
    if (existing) {
        return apiError("PAYMENT_ALREADY_APPLIED", "This payment was already processed", 409);
    }

    // Verify the transfer on-chain.
    const minAmount = priceBaseUnits(plan, interval);
    const verified = await verifyUsdcPayment({ signature, minAmountBaseUnits: minAmount });
    if (!verified) {
        return apiError(
            "PAYMENT_NOT_VERIFIED",
            "Could not verify a USDC payment of the expected amount for this transaction",
            402,
        );
    }

    // SECURITY: bind the payment to the signed-in wallet. On-chain payments to
    // the merchant are public, so without this an attacker could submit someone
    // else's transaction signature and claim their payment (IDOR / claim hijack).
    // The USDC must have left the authenticated wallet (its sender, falling back
    // to the fee payer, must hash to this session's wallet).
    const onChainPayer = verified.sourceOwner ?? verified.feePayer;
    if (!onChainPayer || hashWalletAddress(onChainPayer) !== session.walletHash) {
        return apiError(
            "PAYER_MISMATCH",
            "The payment must be sent from your connected wallet",
            403,
        );
    }

    // Extend from the later of now / the existing period end (renewals stack).
    const now = Date.now();
    const base = org.current_period_end ? new Date(org.current_period_end).getTime() : now;
    const start = new Date(Math.max(now, base));
    const periodEnd = new Date(start.getTime() + PERIOD_DAYS[interval] * 24 * 60 * 60 * 1000);

    const { error: payErr } = await admin.from("billing_payments").insert({
        org_id: org.id,
        plan,
        interval,
        amount_base_units: Number(verified.amountBaseUnits),
        tx_signature: signature,
        payer_wallet: onChainPayer,
        period_start: start.toISOString(),
        period_end: periodEnd.toISOString(),
    });
    if (payErr) {
        // Unique violation = a concurrent apply won the race; treat as applied.
        if (payErr.code === "23505") {
            return apiError("PAYMENT_ALREADY_APPLIED", "This payment was already processed", 409);
        }
        log.error({ payErr }, "Failed to record billing payment");
        return apiError("DB_ERROR", "Failed to record payment", 500);
    }

    await admin
        .from("organizations")
        .update({
            plan,
            subscription_status: "active",
            current_period_end: periodEnd.toISOString(),
        })
        .eq("id", org.id);

    log.info({ orgId: org.id, plan, interval, signature }, "Subscription extended via USDC");

    return NextResponse.json({
        plan,
        interval,
        currentPeriodEnd: periodEnd.toISOString(),
    });
}
