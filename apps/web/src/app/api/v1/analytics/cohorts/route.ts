import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { CohortCriteria } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ─── Validation schemas ───────────────────────────────────────────────────────

const seekerConditionSchema = z.object({ type: z.literal("seeker_only") });
const genesisConditionSchema = z.object({ type: z.literal("has_genesis_token") });
const skrTierConditionSchema = z.object({
    type: z.literal("skr_balance_tier"),
    min_tier: z.enum(["low", "medium", "high"]),
});
const nftCollectionConditionSchema = z.object({
    type: z.literal("nft_collection"),
    collection_mint: z.string().min(32).max(44), // base58 Solana address
    min_count: z.number().int().min(1).default(1).optional(),
});

const conditionSchema = z.discriminatedUnion("type", [
    seekerConditionSchema,
    genesisConditionSchema,
    skrTierConditionSchema,
    nftCollectionConditionSchema,
]);

const criteriaSchema = z.object({
    operator: z.enum(["and", "or"]).default("and"),
    conditions: z.array(conditionSchema).min(1).max(20),
});

const createSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    // Optional app scope — if omitted, cohort is publisher-level
    app_id: z.string().uuid().optional(),
    criteria: criteriaSchema,
});

export async function GET(request: NextRequest): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status !== "ok") {
        return auth.status === "unauthenticated"
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : auth.status === "kyc_required"
                ? apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403)
                : apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
    }

    const supabase = createSupabaseAdminClient();
    const appId = request.nextUrl.searchParams.get("appId");

    let query = supabase
        .from("cohort_definitions")
        .select("*")
        .eq("publisher_id", auth.publisher.id)
        .order("created_at", { ascending: false });

    if (appId) {
        // Return cohorts scoped to this app or publisher-level (null app_id)
        query = query.or(`app_id.eq.${appId},app_id.is.null`);
    }

    const { data, error } = await query;
    if (error) return apiError("DB_ERROR", "Failed to fetch cohorts", 500);

    return NextResponse.json({ cohorts: data });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status !== "ok") {
        return auth.status === "unauthenticated"
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : auth.status === "kyc_required"
                ? apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403)
                : apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
    }

    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.flatten() as unknown as Record<string, unknown>,
        });
    }

    const { name, description, app_id, criteria } = parsed.data;

    const supabase = createSupabaseAdminClient();

    // If app_id is provided, verify ownership
    if (app_id) {
        const { data: app } = await supabase
            .from("apps")
            .select("id")
            .eq("id", app_id)
            .eq("publisher_id", auth.publisher.id)
            .maybeSingle();
        if (!app) return apiError("NOT_FOUND", "App not found", 404);
    }

    const { data: cohort, error } = await supabase
        .from("cohort_definitions")
        .insert({
            publisher_id: auth.publisher.id,
            app_id: app_id ?? null,
            name,
            description: description ?? null,
            criteria: criteria as unknown as CohortCriteria,
        })
        .select("*")
        .single();

    if (error ?? !cohort) return apiError("DB_ERROR", "Failed to create cohort", 500);

    return NextResponse.json({ cohort }, { status: 201 });
}
