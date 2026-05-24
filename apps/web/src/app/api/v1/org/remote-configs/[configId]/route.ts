import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Json, RemoteConfigCondition } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
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

const updateSchema = z.object({
    description: z.string().max(500).optional(),
    base_value: z.unknown().optional(),
    conditions: z.array(conditionSchema).optional(),
    enabled: z.boolean().optional(),
    change_note: z.string().max(500).optional(),
});

type RouteParams = { params: Promise<{ configId: string }> };

async function resolveOwnership(configId: string, publisherId: string) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
        .from("remote_configs")
        .select("id, app_id, key, base_value, conditions, enabled, apps!inner(publisher_id, org_id)")
        .eq("id", configId)
        .maybeSingle();

    if (!data) return null;
    const app = data.apps as unknown as { publisher_id: string; org_id: string | null };
    if (app.publisher_id !== publisherId) return null;
    return { ...data, org_id: app.org_id };
}

/**
 * PUT /api/v1/org/remote-configs/[configId]
 *
 * Updates a remote config. Before applying, writes a history row so the
 * previous values can be restored via a rollback.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { configId } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.issues,
        });
    }

    const existing = await resolveOwnership(configId, auth.publisher.id);
    if (!existing) {
        return apiError("NOT_FOUND", "Remote config not found or access denied", 404);
    }

    const admin = createSupabaseAdminClient();

    // Write history row before applying changes
    const { error: historyError } = await admin.from("remote_config_history").insert({
        config_id: configId,
        previous_base_value: existing.base_value as Json,
        previous_conditions: (existing.conditions ?? []) as RemoteConfigCondition[],
        previous_enabled: existing.enabled,
        changed_by: auth.publisher.id,
        change_note: parsed.data.change_note ?? null,
    });

    if (historyError) {
        console.error("[remote-configs] PUT history insert error", historyError);
        return apiError("DATABASE_ERROR", "Failed to write history record", 500);
    }

    // Apply update
    const typedUpdate: {
        updated_at: string;
        description?: string | null;
        base_value?: Json;
        conditions?: RemoteConfigCondition[];
        enabled?: boolean;
    } = { updated_at: new Date().toISOString() };
    if (parsed.data["description"] !== undefined) typedUpdate.description = parsed.data["description"];
    if (parsed.data["base_value"] !== undefined) typedUpdate.base_value = parsed.data["base_value"] as Json;
    if (parsed.data["conditions"] !== undefined) typedUpdate.conditions = parsed.data["conditions"] as RemoteConfigCondition[];
    if (parsed.data["enabled"] !== undefined) typedUpdate.enabled = parsed.data["enabled"];

    const { data: config, error } = await admin
        .from("remote_configs")
        .update(typedUpdate)
        .eq("id", configId)
        .select("id, key, description, base_value, conditions, enabled, updated_at")
        .single();

    if (error) {
        console.error("[remote-configs] PUT update error", error);
        return apiError("DATABASE_ERROR", "Failed to update remote config", 500);
    }

    if (existing.org_id) {
        await logActivity({
            orgId: existing.org_id,
            actorId: auth.publisher.id,
            action: "REMOTE_CONFIG_UPDATED",
            entityType: "remote_config",
            entityId: configId,
            metadata: { key: existing.key },
        });
    }

    return NextResponse.json({ config });
}

/**
 * DELETE /api/v1/org/remote-configs/[configId]
 *
 * Deletes a remote config (and cascades to its history via FK).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { configId } = await params;

    const existing = await resolveOwnership(configId, auth.publisher.id);
    if (!existing) {
        return apiError("NOT_FOUND", "Remote config not found or access denied", 404);
    }

    const admin = createSupabaseAdminClient();

    const { error } = await admin.from("remote_configs").delete().eq("id", configId);
    if (error) {
        console.error("[remote-configs] DELETE error", error);
        return apiError("DATABASE_ERROR", "Failed to delete remote config", 500);
    }

    if (existing.org_id) {
        await logActivity({
            orgId: existing.org_id,
            actorId: auth.publisher.id,
            action: "REMOTE_CONFIG_DELETED",
            entityType: "remote_config",
            entityId: configId,
            metadata: { key: existing.key },
        });
    }

    return new NextResponse(null, { status: 204 });
}
