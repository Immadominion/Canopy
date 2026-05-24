import { type NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type RouteParams = Promise<{ endpointId: string }>;

async function resolveEndpointOwnership(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    endpointId: string,
    publisherId: string,
): Promise<boolean> {
    const { data: endpoint } = await supabase
        .from("webhook_endpoints")
        .select("id, app_id")
        .eq("id", endpointId)
        .maybeSingle();

    if (!endpoint) return false;

    const { data: app } = await supabase
        .from("apps")
        .select("publisher_id")
        .eq("id", endpoint.app_id)
        .maybeSingle();

    return app?.publisher_id === publisherId;
}

/**
 * GET /api/v1/org/webhooks/[endpointId]/deliveries?cursor=...&limit=50
 *
 * Returns recent delivery log. Signing secrets are never included.
 * Cursor-based pagination by `next_attempt_at` descending.
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

    const { endpointId } = await params;
    const supabase = createSupabaseAdminClient();

    const owned = await resolveEndpointOwnership(supabase, endpointId, auth.publisher.id);
    if (!owned) return apiError("NOT_FOUND", "Webhook endpoint not found", 404);

    const limitParam = request.nextUrl.searchParams.get("limit");
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 50, 100);

    let query = supabase
        .from("webhook_deliveries")
        .select(
            "id, event_type, status, attempts, last_http_status, last_error, delivered_at, next_attempt_at, created_at",
        )
        .eq("endpoint_id", endpointId)
        .order("created_at", { ascending: false })
        .limit(limit + 1); // fetch one extra to detect next page

    if (cursorParam) {
        query = query.lt("created_at", cursorParam);
    }

    const { data, error } = await query;
    if (error) return apiError("DB_ERROR", "Failed to fetch deliveries", 500);

    const hasMore = data.length > limit;
    const deliveries = hasMore ? data.slice(0, limit) : data;
    const nextCursor = hasMore && deliveries.length > 0
        ? deliveries[deliveries.length - 1]?.created_at ?? null
        : null;

    return NextResponse.json({ deliveries, next_cursor: nextCursor });
}
