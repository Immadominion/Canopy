/**
 * GET  /api/v1/crashes/[appId]/[crashId]  — fetch full crash report detail
 * PATCH /api/v1/crashes/[appId]/[crashId]  — update crash status (resolve / reopen)
 *
 * Auth: requires verified publisher who owns the app.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, notFound } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

const updateSchema = z.object({
    action: z.enum(["resolve", "reopen"]),
});

interface RouteContext {
    params: Promise<{ appId: string; crashId: string }>;
}

async function getVerifiedCrash(
    appId: string,
    crashId: string,
    publisherId: string,
) {
    const admin = createSupabaseAdminClient();

    // Verify app ownership before returning crash data
    const { data: app } = await admin
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("publisher_id", publisherId)
        .maybeSingle();

    if (!app) return { app: null, crash: null, admin };

    const { data: crash, error } = await admin
        .from("crash_reports")
        .select("*")
        .eq("id", crashId)
        .eq("app_id", appId)
        .maybeSingle();

    if (error) return { app, crash: null, admin, dbError: error };

    return { app, crash, admin, dbError: undefined };
}

/**
 * GET /api/v1/crashes/[appId]/[crashId]
 * Returns full crash report including stack trace and device context.
 */
export async function GET(_request: Request, ctx: RouteContext): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { appId, crashId } = await ctx.params;
    if (!uuidSchema.safeParse(appId).success || !uuidSchema.safeParse(crashId).success) {
        return notFound();
    }

    const { app, crash, dbError } = await getVerifiedCrash(appId, crashId, auth.publisher.id);

    if (!app) return notFound();
    if (dbError) return apiError("DB_ERROR", "Failed to fetch crash report", 500);
    if (!crash) return notFound();

    return NextResponse.json({
        data: {
            id: crash.id,
            appId: crash.app_id,
            fingerprint: crash.fingerprint,
            errorMessage: crash.error_message,
            stackTrace: crash.stack_trace,
            walletHash: crash.wallet_hash,
            appVersion: crash.app_version,
            sdkVersion: crash.sdk_version,
            deviceModel: crash.device_model,
            androidVersion: crash.android_version,
            occurrenceCount: crash.occurrence_count,
            firstSeenAt: crash.first_seen_at,
            lastSeenAt: crash.last_seen_at,
            resolvedAt: crash.resolved_at,
            createdAt: crash.created_at,
            updatedAt: crash.updated_at,
        },
    });
}

/**
 * PATCH /api/v1/crashes/[appId]/[crashId]
 * Body: { action: "resolve" | "reopen" }
 *
 * resolve: sets resolved_at = now()
 * reopen:  sets resolved_at = null
 */
export async function PATCH(request: Request, ctx: RouteContext): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { appId, crashId } = await ctx.params;
    if (!uuidSchema.safeParse(appId).success || !uuidSchema.safeParse(crashId).success) {
        return notFound();
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_BODY", "Request body must be valid JSON", 400);
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("INVALID_PARAMS", parsed.error.errors[0]?.message ?? "Invalid parameters", 400);
    }

    const { action } = parsed.data;

    const { app, crash, admin, dbError } = await getVerifiedCrash(appId, crashId, auth.publisher.id);

    if (!app) return notFound();
    if (dbError) return apiError("DB_ERROR", "Failed to fetch crash report", 500);
    if (!crash) return notFound();

    // Idempotent: resolve already-resolved or reopen already-open is a no-op
    const resolvedAt = action === "resolve" ? new Date().toISOString() : null;

    const { error: updateError } = await admin
        .from("crash_reports")
        .update({ resolved_at: resolvedAt })
        .eq("id", crashId)
        .eq("app_id", appId);

    if (updateError) {
        console.error("[crashes/update] update failed", updateError);
        return apiError("DB_ERROR", "Failed to update crash report", 500);
    }

    return NextResponse.json({
        data: {
            id: crashId,
            resolvedAt,
            action,
        },
    });
}
