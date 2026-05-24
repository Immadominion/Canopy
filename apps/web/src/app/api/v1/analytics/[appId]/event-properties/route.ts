import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

interface Params {
    params: Promise<{ appId: string }>;
}

/**
 * GET /api/v1/analytics/[appId]/event-properties
 *
 * Returns the top property keys and sample values for a given event name,
 * within a time window. Uses the `get_event_properties` RPC which queries
 * JSONB `properties` column on analytics_events.
 *
 * Query params:
 *   eventName  — event name to inspect (required)
 *   since      — ISO lower bound (default: 30 days ago)
 *   limit      — max number of property keys (default: 10, max: 50)
 *
 * Response:
 *   {
 *     event_name: string,
 *     since: string,
 *     properties: Array<{
 *       property_key: string,
 *       occurrence_count: number,
 *       sample_values: unknown[],
 *     }>,
 *   }
 */
export async function GET(req: NextRequest, { params }: Params) {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (auth.status === "not_publisher") return apiError("NOT_PUBLISHER", "Publisher profile required", 403);
    if (auth.status === "kyc_required") return apiError("KYC_REQUIRED", "KYC verification required", 403);

    const { appId } = await params;

    const url = req.nextUrl;
    const eventName = url.searchParams.get("eventName");
    if (!eventName || eventName.trim() === "") {
        return apiError("MISSING_PARAM", "eventName is required", 400);
    }

    const sinceParam = url.searchParams.get("since");
    const since = sinceParam
        ? new Date(sinceParam).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const limitRaw = Number(url.searchParams.get("limit") ?? "10");
    const limit = Math.min(Math.max(1, Number.isNaN(limitRaw) ? 10 : limitRaw), 50);

    const supabase = createSupabaseAdminClient();

    // Verify app ownership
    const { data: app } = await supabase
        .from("apps")
        .select("id, publisher_id")
        .eq("id", appId)
        .single();

    if (!app) return apiError("NOT_FOUND", "App not found", 404);
    if (app.publisher_id !== auth.publisher.id) {
        return apiError("FORBIDDEN", "App access denied", 403);
    }

    const { data, error } = await supabase.rpc("get_event_properties", {
        _app_id: appId,
        _event_name: eventName,
        _since: since,
        _limit: limit,
    });

    if (error) {
        return apiError("QUERY_ERROR", "Failed to fetch event properties", 500);
    }

    return NextResponse.json({
        event_name: eventName,
        since,
        properties: data ?? [],
    });
}
