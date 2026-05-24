import type { OrgActivityEntityType } from "@canopy/types";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface LogActivityParams {
    orgId: string;
    /** The org_members.id of the member who performed the action. Null = system. */
    actorId?: string | null;
    /** SCREAMING_SNAKE_CASE verb, e.g. API_KEY_CREATED */
    action: string;
    entityType: OrgActivityEntityType;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
}

/**
 * Fire-and-forget activity log write.
 *
 * Errors are swallowed — a failed activity log write must never block
 * the primary operation. Callers should not await unless they need confirmation.
 */
export function logActivity(params: LogActivityParams): void {
    const admin = createSupabaseAdminClient();

    void admin
        .from("org_activity_log")
        .insert({
            org_id: params.orgId,
            actor_id: params.actorId ?? null,
            action: params.action,
            entity_type: params.entityType,
            entity_id: params.entityId ?? null,
            metadata: params.metadata ?? null,
        })
        .then(({ error }) => {
            if (error) {
                console.error("[activity-log] write failed", { action: params.action, error });
            }
        });
}
