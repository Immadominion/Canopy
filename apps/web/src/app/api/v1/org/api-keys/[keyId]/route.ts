import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";

interface RouteParams {
    params: Promise<{ keyId: string }>;
}

/**
 * DELETE /api/v1/org/api-keys/[keyId]
 *
 * Revokes an API key by setting revoked_at to now().
 * Only the org owner may revoke keys.
 * Logs the revocation to the activity log.
 */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { keyId } = await params;

    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const admin = createSupabaseAdminClient();

    const { data: org, error: orgError } = await admin
        .from("organizations")
        .select("id")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (orgError) {
        console.error("[api-keys] DELETE org error", orgError);
        return apiError("DATABASE_ERROR", "Failed to fetch organisation", 500);
    }
    if (!org) {
        return apiError("ORG_NOT_FOUND", "No organisation found for this publisher", 404);
    }

    // Verify the key belongs to this org and is not already revoked
    const { data: key, error: fetchError } = await admin
        .from("api_keys")
        .select("id, name, revoked_at")
        .eq("id", keyId)
        .eq("org_id", org.id)
        .maybeSingle();

    if (fetchError) {
        console.error("[api-keys] DELETE fetch error", fetchError);
        return apiError("DATABASE_ERROR", "Failed to fetch API key", 500);
    }
    if (!key) {
        return apiError("KEY_NOT_FOUND", "API key not found", 404);
    }
    if (key.revoked_at !== null) {
        return apiError("KEY_ALREADY_REVOKED", "API key has already been revoked", 409);
    }

    const { error: revokeError } = await admin
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", keyId);

    if (revokeError) {
        console.error("[api-keys] DELETE revoke error", revokeError);
        return apiError("DATABASE_ERROR", "Failed to revoke API key", 500);
    }

    // Resolve actor for activity log
    const { data: actorMember } = await admin
        .from("org_members")
        .select("id")
        .eq("org_id", org.id)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    logActivity({
        orgId: org.id,
        actorId: actorMember?.id ?? null,
        action: "API_KEY_REVOKED",
        entityType: "api_key",
        entityId: keyId,
        metadata: { name: key.name },
    });

    return NextResponse.json({ success: true });
}
