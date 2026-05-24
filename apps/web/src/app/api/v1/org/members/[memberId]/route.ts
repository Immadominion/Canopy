import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const updateRoleSchema = z.object({
    role: z.enum(["admin", "developer", "viewer"]),
});

interface RouteParams {
    params: Promise<{ memberId: string }>;
}

/**
 * PATCH /api/v1/org/members/[memberId]
 *
 * Updates a member's role. Only the owner or admin may do this.
 * The owner's own role cannot be changed via this endpoint.
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { memberId } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid role", 400, {
            issues: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();

    // Resolve the publisher's org.
    const { data: org } = await admin
        .from("organizations")
        .select("id")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (!org) {
        return apiError("ORG_NOT_FOUND", "No organisation found", 404);
    }

    // Verify the caller is owner or admin.
    const { data: callerMember } = await admin
        .from("org_members")
        .select("role")
        .eq("org_id", org.id)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (!callerMember || !["owner", "admin"].includes(callerMember.role)) {
        return apiError("FORBIDDEN", "Only the owner or admin may update roles", 403);
    }

    // Fetch the target member.
    const { data: target } = await admin
        .from("org_members")
        .select("id, role")
        .eq("id", memberId)
        .eq("org_id", org.id)
        .maybeSingle();

    if (!target) {
        return apiError("MEMBER_NOT_FOUND", "Member not found", 404);
    }

    if (target.role === "owner") {
        return apiError("CANNOT_CHANGE_OWNER_ROLE", "The owner's role cannot be changed", 409);
    }

    const { data: updated, error } = await admin
        .from("org_members")
        .update({ role: parsed.data.role })
        .eq("id", memberId)
        .select("id, role")
        .single();

    if (error ?? !updated) {
        console.error("[org/members] update role error", error);
        return apiError("DATABASE_ERROR", "Failed to update role", 500);
    }

    return NextResponse.json({ member: updated });
}

/**
 * DELETE /api/v1/org/members/[memberId]
 *
 * Removes a member from the org. The owner cannot be removed.
 * Owner or admin may remove other members.
 */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { memberId } = await params;

    const admin = createSupabaseAdminClient();

    // Resolve the publisher's org.
    const { data: org } = await admin
        .from("organizations")
        .select("id")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (!org) {
        return apiError("ORG_NOT_FOUND", "No organisation found", 404);
    }

    // Verify the caller is owner or admin.
    const { data: callerMember } = await admin
        .from("org_members")
        .select("role")
        .eq("org_id", org.id)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (!callerMember || !["owner", "admin"].includes(callerMember.role)) {
        return apiError("FORBIDDEN", "Only the owner or admin may remove members", 403);
    }

    // Fetch target and ensure they're not the owner.
    const { data: target } = await admin
        .from("org_members")
        .select("id, role")
        .eq("id", memberId)
        .eq("org_id", org.id)
        .maybeSingle();

    if (!target) {
        return apiError("MEMBER_NOT_FOUND", "Member not found", 404);
    }

    if (target.role === "owner") {
        return apiError("CANNOT_REMOVE_OWNER", "The owner cannot be removed from the org", 409);
    }

    const { error } = await admin.from("org_members").delete().eq("id", memberId);

    if (error) {
        console.error("[org/members] delete error", error);
        return apiError("DATABASE_ERROR", "Failed to remove member", 500);
    }

    return new NextResponse(null, { status: 204 });
}
