import { type NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { DAY_MS, parseBoundedInt, parseDateRange } from "@/lib/api/query";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type RouteParams = Promise<{ appId: string }>;

async function verifyAppOwnership(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    appId: string,
    publisherId: string,
): Promise<boolean> {
    const { data } = await supabase
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("publisher_id", publisherId)
        .maybeSingle();
    return data !== null;
}

/**
 * GET /api/v1/analytics/[appId]/retention?since=...&until=...&maxDays=30
 *
 * Returns day-by-day retention data for the wallet cohort that first appeared
 * in the given time window.
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

    const { appId } = await params;
    const supabase = createSupabaseAdminClient();
    const owned = await verifyAppOwnership(supabase, appId, auth.publisher.id);
    if (!owned) return apiError("NOT_FOUND", "App not found", 404);

    const range = parseDateRange(request, { defaultSinceMs: Date.now() - 30 * DAY_MS });
    if (range instanceof NextResponse) return range;
    const { since, until } = range;
    const maxDays = parseBoundedInt(request.nextUrl.searchParams.get("maxDays"), {
        fallback: 30,
        min: 1,
        max: 90,
    });

    const { data, error } = await supabase.rpc("get_retention", {
        _app_id: appId,
        _since: since,
        _until: until,
        _max_days: maxDays,
    });

    if (error) return apiError("QUERY_ERROR", "Failed to run retention query", 500);

    return NextResponse.json({ app_id: appId, retention: data });
}
