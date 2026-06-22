import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { FunnelStep } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { DAY_MS, parseDateRange } from "@/lib/api/query";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type RouteParams = Promise<{ funnelId: string }>;

async function resolveFunnelOwnership(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    funnelId: string,
    publisherId: string,
): Promise<{ id: string; app_id: string; name: string; steps: unknown } | null> {
    const { data: fd } = await supabase
        .from("funnel_definitions")
        .select("id, app_id, name, steps")
        .eq("id", funnelId)
        .maybeSingle();

    if (!fd) return null;

    const { data: app } = await supabase
        .from("apps")
        .select("publisher_id")
        .eq("id", fd.app_id)
        .maybeSingle();

    if (!app || app.publisher_id !== publisherId) return null;
    return { id: fd.id, app_id: fd.app_id, name: fd.name as string, steps: fd.steps };
}

/**
 * GET /api/v1/analytics/funnels/[funnelId]/results?since=...&until=...
 *
 * Runs the funnel query via the get_funnel_counts RPC.
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

    const { funnelId } = await params;
    const supabase = createSupabaseAdminClient();
    const funnel = await resolveFunnelOwnership(supabase, funnelId, auth.publisher.id);
    if (!funnel) return apiError("NOT_FOUND", "Funnel not found", 404);

    const range = parseDateRange(request, { defaultSinceMs: Date.now() - 30 * DAY_MS });
    if (range instanceof NextResponse) return range;
    const { since, until } = range;

    const steps = (funnel.steps as Array<{ event_name: string }>).map((s) => s.event_name);

    const { data, error } = await supabase.rpc("get_funnel_counts", {
        _app_id: funnel.app_id,
        _steps: steps,
        _since: since,
        _until: until,
    });

    if (error) return apiError("QUERY_ERROR", "Failed to run funnel query", 500);

    return NextResponse.json({ funnel_id: funnelId, results: data });
}

const updateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    steps: z
        .array(
            z.object({
                event_name: z.string().min(1).max(120),
                label: z.string().max(120).optional(),
            }),
        )
        .min(2)
        .max(5)
        .optional(),
});

/**
 * PATCH /api/v1/analytics/funnels/[funnelId]
 *
 * Updates funnel name or steps.
 */
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

    const { funnelId } = await params;
    const supabase = createSupabaseAdminClient();
    const funnel = await resolveFunnelOwnership(supabase, funnelId, auth.publisher.id);
    if (!funnel) return apiError("NOT_FOUND", "Funnel not found", 404);

    const body: unknown = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.flatten() as unknown as Record<string, unknown>,
        });
    }

    const typedUpdate: { name?: string; steps?: FunnelStep[] } = {};
    if (parsed.data.name !== undefined) typedUpdate.name = parsed.data.name;
    if (parsed.data.steps !== undefined)
        typedUpdate.steps = parsed.data.steps as FunnelStep[];
    if (Object.keys(typedUpdate).length === 0) {
        return apiError("NO_CHANGES", "No fields to update", 400);
    }

    const { data, error } = await supabase
        .from("funnel_definitions")
        .update(typedUpdate)
        .eq("id", funnelId)
        .select()
        .single();

    if (error) return apiError("DB_ERROR", "Failed to update funnel", 500);

    return NextResponse.json({ funnel: data });
}

/**
 * DELETE /api/v1/analytics/funnels/[funnelId]
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

    const { funnelId } = await params;
    const supabase = createSupabaseAdminClient();
    const funnel = await resolveFunnelOwnership(supabase, funnelId, auth.publisher.id);
    if (!funnel) return apiError("NOT_FOUND", "Funnel not found", 404);

    const { error } = await supabase.from("funnel_definitions").delete().eq("id", funnelId);
    if (error) return apiError("DB_ERROR", "Failed to delete funnel", 500);

    return new NextResponse(null, { status: 204 });
}
