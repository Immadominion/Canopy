import { type NextRequest, NextResponse } from "next/server";

import type { ExperimentVariant } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { computeExperimentResults } from "../route";

type RouteParams = Promise<{ experimentId: string }>;

/**
 * GET /api/v1/analytics/experiments/[experimentId]/results
 *
 * Returns per-variant metrics for an experiment within a time window.
 * Analytics events must have been tagged with:
 *   properties.ab_experiment_id = experiment UUID
 *   properties.ab_variant_id    = variant UUID
 *
 * Query params:
 *   since — ISO-8601 start (default: experiment.started_at or 30 days ago)
 *   until — ISO-8601 end (default: now)
 */
export async function GET(
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

    // Fetch experiment + ownership check (two-step to avoid Supabase join type issues)
    const { data: exp } = await supabase
        .from("experiments")
        .select("id, app_id, status, started_at")
        .eq("id", experimentId)
        .maybeSingle();

    if (!exp) return apiError("NOT_FOUND", "Experiment not found", 404);

    const { data: appRow } = await supabase
        .from("apps")
        .select("publisher_id")
        .eq("id", exp.app_id)
        .maybeSingle();

    if (!appRow || appRow.publisher_id !== auth.publisher.id) {
        return apiError("NOT_FOUND", "Experiment not found", 404);
    }

    const { data: variantsData } = await supabase
        .from("experiment_variants")
        .select("*")
        .eq("experiment_id", experimentId)
        .order("weight", { ascending: false });

    const variants = (variantsData ?? []) as ExperimentVariant[];

    const sinceParam = request.nextUrl.searchParams.get("since");
    const untilParam = request.nextUrl.searchParams.get("until");

    const since = sinceParam
        ? new Date(sinceParam).toISOString()
        : exp.started_at
            ? exp.started_at
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const until = untilParam ? new Date(untilParam).toISOString() : new Date().toISOString();

    const results = await computeExperimentResults(supabase, experimentId, variants, since, until);

    return NextResponse.json({
        experiment_id: experimentId,
        status: exp.status,
        since,
        until,
        results,
    });
}
