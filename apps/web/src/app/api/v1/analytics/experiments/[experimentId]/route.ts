import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { ExperimentVariant } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
type RouteParams = Promise<{ experimentId: string }>;

async function resolveExperimentOwnership(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    experimentId: string,
    publisherId: string,
): Promise<{ id: string; app_id: string; status: string } | null> {
    // Two-step: fetch experiment, then verify app ownership.
    // Avoids Supabase join type-inference issues with cross-table selects.
    const { data: exp } = await supabase
        .from("experiments")
        .select("id, app_id, status")
        .eq("id", experimentId)
        .maybeSingle();

    if (!exp) return null;

    const { data: app } = await supabase
        .from("apps")
        .select("publisher_id")
        .eq("id", exp.app_id)
        .maybeSingle();

    if (!app || app.publisher_id !== publisherId) return null;
    return { id: exp.id, app_id: exp.app_id, status: exp.status };
}

export async function GET(
    _request: NextRequest,
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

    const { experimentId } = await params;
    const supabase = createSupabaseAdminClient();
    const exp = await resolveExperimentOwnership(supabase, experimentId, auth.publisher.id);
    if (!exp) return apiError("NOT_FOUND", "Experiment not found", 404);

    const { data } = await supabase
        .from("experiments")
        .select("*, experiment_variants(*)")
        .eq("id", experimentId)
        .single();

    return NextResponse.json({ experiment: data });
}

const updateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(1000).nullable().optional(),
    traffic_percentage: z.number().int().min(1).max(100).optional(),
    status: z.enum(["draft", "active", "concluded"]).optional(),
});

export async function PATCH(
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

    const { experimentId } = await params;
    const supabase = createSupabaseAdminClient();
    const exp = await resolveExperimentOwnership(supabase, experimentId, auth.publisher.id);
    if (!exp) return apiError("NOT_FOUND", "Experiment not found", 404);

    // Cannot modify a concluded experiment
    if (exp.status === "concluded") {
        return apiError("INVALID_STATE", "Concluded experiments cannot be modified", 409);
    }

    const body: unknown = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.flatten() as unknown as Record<string, unknown>,
        });
    }

    const updates: {
        name?: string;
        description?: string | null;
        traffic_percentage?: number;
        status?: "draft" | "active" | "concluded";
        started_at?: string | null;
        concluded_at?: string | null;
        updated_at?: string;
    } = {};

    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if ("description" in parsed.data) updates.description = parsed.data.description ?? null;
    if (parsed.data.traffic_percentage !== undefined)
        updates.traffic_percentage = parsed.data.traffic_percentage;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    // Stamp started_at when activating; concluded_at when concluding
    if (parsed.data.status === "active" && exp.status === "draft") {
        updates.started_at = new Date().toISOString();
    } else if (parsed.data.status === "concluded") {
        updates.concluded_at = new Date().toISOString();
    }

    const { data, error } = await supabase
        .from("experiments")
        .update(updates)
        .eq("id", experimentId)
        .select("*, experiment_variants(*)")
        .single();

    if (error) return apiError("DB_ERROR", "Failed to update experiment", 500);

    return NextResponse.json({ experiment: data });
}

export async function DELETE(
    _request: NextRequest,
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

    const { experimentId } = await params;
    const supabase = createSupabaseAdminClient();
    const exp = await resolveExperimentOwnership(supabase, experimentId, auth.publisher.id);
    if (!exp) return apiError("NOT_FOUND", "Experiment not found", 404);

    // Cannot delete an active experiment (must conclude first)
    if (exp.status === "active") {
        return apiError(
            "INVALID_STATE",
            "Active experiments cannot be deleted. Conclude the experiment first.",
            409,
        );
    }

    const { error } = await supabase.from("experiments").delete().eq("id", experimentId);
    if (error) return apiError("DB_ERROR", "Failed to delete experiment", 500);

    return new NextResponse(null, { status: 204 });
}

// ─── Results sub-resource ─────────────────────────────────────────────────────
// Exposed via GET /api/v1/analytics/experiments/[experimentId]/results
// but also importable here for code-sharing purposes.

export type VariantResult = {
    variant_id: string;
    variant_name: string;
    exposed_wallets: number;
    events: Record<string, number>; // event_name -> count
};

/**
 * Compute per-variant metrics by querying analytics_events.
 * Events tagged with ab_experiment_id + ab_variant_id in their properties
 * are aggregated by variant.
 */
export async function computeExperimentResults(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    experimentId: string,
    variants: ExperimentVariant[],
    since: string,
    until: string,
): Promise<VariantResult[]> {
    // Query events that belong to this experiment within the time window.
    // Events store: properties->>'ab_experiment_id' and properties->>'ab_variant_id'
    const { data: events } = await supabase
        .from("analytics_events")
        .select("wallet_hash, name, properties")
        .gte("timestamp", since)
        .lte("timestamp", until)
        .filter("properties->>ab_experiment_id", "eq", experimentId);

    const variantMap = new Map(variants.map((v) => [v.id, v.name]));
    const results = new Map<string, VariantResult>();

    // Initialise result buckets for all variants
    for (const v of variants) {
        results.set(v.id, {
            variant_id: v.id,
            variant_name: v.name,
            exposed_wallets: 0,
            events: {},
        });
    }

    // Accumulate unique wallets and event counts per variant
    const seenWallets = new Map<string, Set<string>>();

    for (const event of events ?? []) {
        const props = event.properties as Record<string, unknown> | null;
        const variantId = props?.["ab_variant_id"] as string | undefined;
        if (!variantId || !variantMap.has(variantId)) continue;

        const result = results.get(variantId);
        if (!result) continue;

        const walletKey = `${variantId}:${event.wallet_hash}`;
        if (!seenWallets.has(variantId)) seenWallets.set(variantId, new Set());
        const walletSet = seenWallets.get(variantId);
        if (!walletSet) continue;
        if (!walletSet.has(walletKey)) {
            walletSet.add(walletKey);
            result.exposed_wallets++;
        }

        result.events[event.name] = (result.events[event.name] ?? 0) + 1;
    }

    return Array.from(results.values());
}
