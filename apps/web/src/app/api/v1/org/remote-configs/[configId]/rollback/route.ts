import { type NextRequest, NextResponse } from "next/server";

import type { Json, RemoteConfigCondition } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";

type RouteParams = { params: Promise<{ configId: string }> };

/**
 * POST /api/v1/org/remote-configs/[configId]/rollback
 *
 * Restores the most recent history snapshot for this config.
 * Writes another history row so the rollback itself is tracked.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
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
    const admin = createSupabaseAdminClient();

    // Resolve ownership
    const { data: config } = await admin
        .from("remote_configs")
        .select("id, key, base_value, conditions, enabled, apps!inner(publisher_id, org_id)")
        .eq("id", configId)
        .maybeSingle();

    if (!config) {
        return apiError("NOT_FOUND", "Remote config not found or access denied", 404);
    }
    const app = config.apps as unknown as { publisher_id: string; org_id: string | null };
    if (app.publisher_id !== auth.publisher.id) {
        return apiError("NOT_FOUND", "Remote config not found or access denied", 404);
    }

    // Fetch latest history entry
    const { data: history } = await admin
        .from("remote_config_history")
        .select("id, previous_base_value, previous_conditions, previous_enabled")
        .eq("config_id", configId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!history) {
        return apiError("NO_HISTORY", "No history available to roll back to", 409);
    }

    // Write current state to history before overwriting
    const { error: historyError } = await admin.from("remote_config_history").insert({
        config_id: configId,
        previous_base_value: config.base_value as Json,
        previous_conditions: (config.conditions ?? []) as RemoteConfigCondition[],
        previous_enabled: config.enabled,
        changed_by: auth.publisher.id,
        change_note: "Rollback to previous version",
    });

    if (historyError) {
        console.error("[remote-configs/rollback] history insert error", historyError);
        return apiError("DATABASE_ERROR", "Failed to write history record", 500);
    }

    // Apply rollback
    const { data: updated, error } = await admin
        .from("remote_configs")
        .update({
            base_value: history.previous_base_value as Json,
            conditions: (history.previous_conditions ?? []) as RemoteConfigCondition[],
            enabled: history.previous_enabled,
            updated_at: new Date().toISOString(),
        })
        .eq("id", configId)
        .select("id, key, base_value, conditions, enabled, updated_at")
        .single();

    if (error) {
        console.error("[remote-configs/rollback] update error", error);
        return apiError("DATABASE_ERROR", "Failed to apply rollback", 500);
    }

    if (app.org_id) {
        await logActivity({
            orgId: app.org_id,
            actorId: auth.publisher.id,
            action: "REMOTE_CONFIG_ROLLED_BACK",
            entityType: "remote_config",
            entityId: configId,
            metadata: { key: config.key },
        });
    }

    return NextResponse.json({ config: updated });
}
