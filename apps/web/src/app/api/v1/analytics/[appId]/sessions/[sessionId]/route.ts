import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { DAY_MS, parseSince } from "@/lib/api/query";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

interface Params {
    params: Promise<{ appId: string; sessionId: string }>;
}

/**
 * GET /api/v1/analytics/[appId]/sessions/[sessionId]
 *
 * Returns all analytics events for the given session, ordered by timestamp ASC.
 *
 * IMPORTANT: analytics_events is a TimescaleDB hypertable. A time-range filter
 * is mandatory. We use a 90-day lookback as a safe default (sessions are
 * always shorter than 90 days). The caller may pass `?since=ISO` to narrow
 * the window for performance.
 *
 * Query params:
 *   since  — ISO timestamp lower bound (default: 90 days ago)
 *
 * Response:
 *   {
 *     session_id: string,
 *     events: Array<{
 *       id: string,
 *       name: string,
 *       timestamp: string,
 *       wallet_hash: string,
 *       properties: Record<string, unknown> | null,
 *       platform: string | null,
 *       app_version: string | null,
 *       sdk_version: string | null,
 *       is_seeker: boolean,
 *       has_genesis_token: boolean,
 *     }>,
 *   }
 */
export async function GET(req: NextRequest, { params }: Params) {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (auth.status === "not_publisher") return apiError("NOT_PUBLISHER", "Publisher profile required", 403);
    if (auth.status === "kyc_required") return apiError("KYC_REQUIRED", "KYC verification required", 403);

    const { appId, sessionId } = await params;

    if (!sessionId || sessionId.trim() === "") {
        return apiError("INVALID_SESSION_ID", "session_id is required", 400);
    }

    const sinceResult = parseSince(req, Date.now() - 90 * DAY_MS);
    if (sinceResult instanceof NextResponse) return sinceResult;
    const since = sinceResult;

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

    // Fetch all events for this session within the time window.
    // analytics_events is a hypertable — timestamp filter is mandatory.
    const { data: events, error } = await supabase
        .from("analytics_events")
        .select(
            "id, name, timestamp, wallet_hash, properties, platform, app_version, sdk_version, is_seeker, has_genesis_token"
        )
        .eq("app_id", appId)
        .eq("session_id", sessionId)
        .gte("timestamp", since)
        .order("timestamp", { ascending: true })
        .limit(500); // Guard against runaway sessions

    if (error) {
        return apiError("QUERY_ERROR", "Failed to fetch session events", 500);
    }

    if (!events || events.length === 0) {
        return apiError("NOT_FOUND", "Session not found or no events in the time window", 404);
    }

    return NextResponse.json({
        session_id: sessionId,
        events,
    });
}
