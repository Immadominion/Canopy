import { after } from "next/server";

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
 * Best-effort activity (audit) log write, deferred to after the response via
 * `after()` so the serverless runtime can't tear it down mid-write. A plain
 * un-awaited insert was getting dropped when the response returned, leaving gaps
 * in the audit trail for security-relevant actions (key creation, member
 * changes). Errors are swallowed — a failed audit write must never block the
 * primary operation. Safe to call from any route handler (request scope).
 */
export function logActivity(params: LogActivityParams): void {
    after(async () => {
        const admin = createSupabaseAdminClient();
        const { error } = await admin.from("org_activity_log").insert({
            org_id: params.orgId,
            actor_id: params.actorId ?? null,
            action: params.action,
            entity_type: params.entityType,
            entity_id: params.entityId ?? null,
            metadata: params.metadata ?? null,
        });
        if (error) {
            console.error("[activity-log] write failed", { action: params.action, error });
        }
    });
}
