import { type NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type RouteParams = Promise<{ endpointId: string }>;

async function resolveEndpointOwnership(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    endpointId: string,
    publisherId: string,
): Promise<{ id: string; url: string; app_id: string } | null> {
    const { data: endpoint } = await supabase
        .from("webhook_endpoints")
        .select("id, url, app_id")
        .eq("id", endpointId)
        .maybeSingle();

    if (!endpoint) return null;

    const { data: app } = await supabase
        .from("apps")
        .select("publisher_id")
        .eq("id", endpoint.app_id)
        .maybeSingle();

    if (!app || app.publisher_id !== publisherId) return null;

    return { id: endpoint.id, url: endpoint.url, app_id: endpoint.app_id };
}

/**
 * DELETE /api/v1/org/webhooks/[endpointId]
 */
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

    const { endpointId } = await params;
    const supabase = createSupabaseAdminClient();
    const endpoint = await resolveEndpointOwnership(supabase, endpointId, auth.publisher.id);
    if (!endpoint) return apiError("NOT_FOUND", "Webhook endpoint not found", 404);

    const { error } = await supabase
        .from("webhook_endpoints")
        .delete()
        .eq("id", endpointId);

    if (error) return apiError("DB_ERROR", "Failed to delete webhook endpoint", 500);

    return new NextResponse(null, { status: 204 });
}

/**
 * GET /api/v1/org/webhooks/[endpointId]/deliveries
 *
 * Returns recent delivery log for the endpoint.
 * Handled in the nested route — this route only exposes DELETE.
 */
