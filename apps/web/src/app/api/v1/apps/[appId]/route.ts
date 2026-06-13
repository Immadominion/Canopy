import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, notFound } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { deleteApkFromR2 } from "@/lib/r2/client";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const log = logger.child({ module: "apps/[appId]" });

const updateAppSchema = z
    .object({
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        dappStoreAppId: z.string().trim().max(255).nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

interface RouteContext {
    params: Promise<{ appId: string }>;
}

const uuidSchema = z.string().uuid();

/**
 * GET /api/v1/apps/[appId] — fetch a single app the publisher owns.
 *
 * Returns 404 (not 403) for apps owned by other publishers, to avoid leaking
 * existence of resources to unauthorised callers.
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

    const { appId } = await ctx.params;
    if (!uuidSchema.safeParse(appId).success) return notFound();

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from("apps")
        .select("id, name, package_name, description, dapp_store_app_id, created_at, updated_at, publisher_id")
        .eq("id", appId)
        .maybeSingle();

    if (error) return apiError("DB_ERROR", "Failed to fetch app", 500);
    if (!data || data.publisher_id !== auth.publisher.id) return notFound();

    return NextResponse.json({
        id: data.id,
        name: data.name,
        packageName: data.package_name,
        description: data.description,
        dappStoreAppId: data.dapp_store_app_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    });
}

/**
 * PATCH /api/v1/apps/[appId] — update mutable fields of an app the publisher owns.
 *
 * `packageName` is intentionally NOT mutable: changing it would invalidate any
 * existing beta tracks/testers/install records tied to the package identity.
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

    const { appId } = await ctx.params;
    if (!uuidSchema.safeParse(appId).success) return notFound();

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = updateAppSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fieldErrors: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();

    // Ownership check before mutation — 404 on miss to avoid disclosing existence.
    const { data: existing } = await admin
        .from("apps")
        .select("publisher_id")
        .eq("id", appId)
        .maybeSingle();

    if (!existing || existing.publisher_id !== auth.publisher.id) return notFound();

    const update: {
        name?: string;
        description?: string | null;
        dapp_store_app_id?: string | null;
    } = {};
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.dappStoreAppId !== undefined) update.dapp_store_app_id = parsed.data.dappStoreAppId;

    const { data, error } = await admin
        .from("apps")
        .update(update)
        .eq("id", appId)
        .select("id, name, package_name, description, dapp_store_app_id, created_at, updated_at")
        .single();

    if (error) return apiError("DB_ERROR", "Failed to update app", 500);

    return NextResponse.json({
        id: data.id,
        name: data.name,
        packageName: data.package_name,
        description: data.description,
        dappStoreAppId: data.dapp_store_app_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    });
}

/**
 * DELETE /api/v1/apps/[appId] — delete an app the publisher owns.
 *
 * Two modes:
 *  - Default (safe): `beta_tracks.app_id` is `ON DELETE RESTRICT`, so an app
 *    with any beta tracks returns 409 `APP_HAS_TRACKS`. This guards against an
 *    accidental cascade orphaning testers / install events.
 *  - `?cascade=true` (deliberate): runs `delete_app_cascade()`, which atomically
 *    deletes the app's tracks (cascading testers + install_events, NULLing
 *    releases.beta_track_id) and the app (cascading releases, remote_configs,
 *    analytics, experiments, cohorts), and returns the R2 keys of every build
 *    binary so we can purge them from storage afterwards. Immutable Arweave
 *    fingerprint records are preserved by design.
 */
export async function DELETE(request: Request, ctx: RouteContext): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { appId } = await ctx.params;
    if (!uuidSchema.safeParse(appId).success) return notFound();

    const cascade = new URL(request.url).searchParams.get("cascade") === "true";

    const admin = createSupabaseAdminClient();

    const { data: existing } = await admin
        .from("apps")
        .select("publisher_id")
        .eq("id", appId)
        .maybeSingle();

    if (!existing || existing.publisher_id !== auth.publisher.id) return notFound();

    if (cascade) {
        // Atomic multi-table delete; returns the R2 keys to purge.
        const { data: keys, error: rpcError } = await admin.rpc("delete_app_cascade", {
            p_app_id: appId,
        });
        if (rpcError) {
            log.error({ appId, err: rpcError }, "delete_app_cascade failed");
            return apiError("DB_ERROR", "Failed to delete app", 500);
        }

        // Purge each build binary from R2 (best-effort — the DB rows are already
        // gone, so a failed delete only strands a private, unreachable object).
        for (const row of keys ?? []) {
            if (!row.r2_key) continue;
            try {
                await deleteApkFromR2(row.r2_key);
            } catch (err) {
                log.warn({ appId, r2Key: row.r2_key, err }, "Failed to purge build binary on app delete");
            }
        }

        return new NextResponse(null, { status: 204 });
    }

    const { error } = await admin.from("apps").delete().eq("id", appId);
    if (error) {
        // Postgres foreign-key violation: beta tracks still reference this app
        if (error.code === "23503") {
            return apiError(
                "APP_HAS_TRACKS",
                "Cannot delete app while beta tracks reference it. Retry with ?cascade=true to remove all builds.",
                409,
            );
        }
        return apiError("DB_ERROR", "Failed to delete app", 500);
    }

    return new NextResponse(null, { status: 204 });
}
