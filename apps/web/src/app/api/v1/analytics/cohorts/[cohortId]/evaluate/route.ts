import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { CohortCriteria } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { evaluateCohort } from "@/lib/cohort/evaluator";

type RouteParams = Promise<{ cohortId: string }>;

// Solana base58 address pattern (32–44 characters of base58 alphabet)
const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const evaluateSchema = z.object({
    /**
     * Plaintext base58 wallet address to evaluate cohort membership for.
     * This endpoint is only for publisher-side tooling (e.g., checking whether
     * a specific tester qualifies for a cohort). Never use for bulk user lookups.
     */
    walletAddress: z
        .string()
        .min(32)
        .max(44)
        .regex(solanaAddressRegex, "Must be a valid Solana base58 address"),
});

/**
 * POST /api/v1/analytics/cohorts/[cohortId]/evaluate
 *
 * Evaluates whether a given wallet satisfies a cohort's on-chain criteria.
 * Uses Helius DAS API (getAssetsByOwner) to check NFT holdings and token balances.
 *
 * This endpoint requires publisher authentication and is rate-limited to
 * prevent bulk wallet profiling. It DOES NOT store the wallet address.
 *
 * Body: { walletAddress: string }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: RouteParams },
): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status !== "ok") {
        return auth.status === "unauthenticated"
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : auth.status === "kyc_required"
                ? apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403)
                : apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
    }

    const { cohortId } = await params;
    const supabase = createSupabaseAdminClient();

    // Verify cohort ownership
    const { data: cohortRow } = await supabase
        .from("cohort_definitions")
        .select("id, name, criteria")
        .eq("id", cohortId)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (!cohortRow) return apiError("NOT_FOUND", "Cohort not found", 404);

    const body: unknown = await request.json();
    const parsed = evaluateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.flatten() as unknown as Record<string, unknown>,
        });
    }

    const { walletAddress } = parsed.data;
    const criteria = cohortRow.criteria as CohortCriteria;

    let isMember: boolean;
    try {
        isMember = await evaluateCohort(walletAddress, criteria);
    } catch {
        return apiError(
            "EVALUATION_ERROR",
            "Failed to evaluate cohort — on-chain lookup error",
            502,
        );
    }

    // Never log or store the plaintext walletAddress
    return NextResponse.json({
        cohort_id: cohortId,
        cohort_name: cohortRow.name,
        is_member: isMember,
    });
}
