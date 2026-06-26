import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Json, RemoteConfigCondition } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { requireFeature } from "@/lib/billing/entitlements";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";

const conditionSchema = z.object({
    type: z.enum(["seeker_only", "app_version", "percentage_rollout", "on_chain_cohort"]),
    override_value: z.custom<Json>(),
    percentage: z.number().min(0).max(100).optional(),
    operator: z.enum(["gte", "lte", "eq"]).optional(),
    version: z.string().optional(),
    min_skr_tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    nft_collection: z.string().optional(),
});

const createSchema = z.object({
    app_id: z.string().uuid(),
    key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_.]{0,98}$/),
    description: z.string().max(500).optional(),
    base_value: z.unknown(),
    conditions: z.array(conditionSchema).default([]),
    enabled: z.boolean().default(true),
});

/**
 * GET /api/v1/org/remote-configs?appId=...
 *
 * Lists all remote config entries for the publisher's app.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const appId = request.nextUrl.searchParams.get("appId");
    if (!appId) {
        return apiError("MISSING_PARAM", "appId query parameter is required", 400);
    }

    const admin = createSupabaseAdminClient();

    // Verify ownership
    const { data: app, error: appError } = await admin
        .from("apps")
        .select("id, publisher_id")
        .eq("id", appId)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (appError) {
        console.error("[remote-configs] GET app error", appError);
        return apiError("DATABASE_ERROR", "Failed to verify app ownership", 500);
    }
    if (!app) {
        return apiError("NOT_FOUND", "App not found or access denied", 404);
    }

    const { data: configs, error } = await admin
        .from("remote_configs")
        .select("id, key, description, base_value, conditions, enabled, created_at, updated_at")
        .eq("app_id", appId)
        .order("key");

    if (error) {
        console.error("[remote-configs] GET error", error);
        return apiError("DATABASE_ERROR", "Failed to fetch remote configs", 500);
    }

    return NextResponse.json({ configs });
}

/**
 * POST /api/v1/org/remote-configs
 *
 * Creates a new remote config entry.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.issues,
        });
    }

    const { app_id, key, description, base_value, conditions, enabled } = parsed.data;
    const admin = createSupabaseAdminClient();

    // Verify ownership
    const { data: app, error: appError } = await admin
        .from("apps")
        .select("id, org_id")
        .eq("id", app_id)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (appError) {
        console.error("[remote-configs] POST app error", appError);
        return apiError("DATABASE_ERROR", "Failed to verify app ownership", 500);
    }
    if (!app) {
        return apiError("NOT_FOUND", "App not found or access denied", 404);
    }

    // Remote Config is a paid feature — enforce server-side.
    const gate = await requireFeature(admin, auth.publisher.id, "remoteConfig");
    if (gate) return gate;

    // Check for duplicate key
    const { data: existing } = await admin
        .from("remote_configs")
        .select("id")
        .eq("app_id", app_id)
        .eq("key", key)
        .maybeSingle();

    if (existing) {
        return apiError("KEY_CONFLICT", `Config key '${key}' already exists for this app`, 409);
    }

    const { data: config, error } = await admin
        .from("remote_configs")
        .insert({
            app_id,
            key,
            description: description ?? null,
            base_value: base_value as Json,
            conditions: conditions as RemoteConfigCondition[],
            enabled,
        })
        .select("id, key, description, base_value, conditions, enabled, created_at, updated_at")
        .single();

    if (error) {
        console.error("[remote-configs] POST insert error", error);
        return apiError("DATABASE_ERROR", "Failed to create remote config", 500);
    }

    if (app.org_id) {
        await logActivity({
            orgId: app.org_id,
            actorId: auth.publisher.id,
            action: "REMOTE_CONFIG_CREATED",
            entityType: "remote_config",
            entityId: config.id,
            metadata: { key },
        });
    }

    return NextResponse.json({ config }, { status: 201 });
}
