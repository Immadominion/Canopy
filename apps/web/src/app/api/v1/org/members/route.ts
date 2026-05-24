import { randomBytes } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { sendInviteEmail } from "@/lib/email/invite";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const INVITABLE_ROLES = ["admin", "developer", "viewer"] as const;

const inviteMemberSchema = z.object({
    email: z.string().trim().email(),
    role: z.enum(INVITABLE_ROLES),
});

/**
 * GET /api/v1/org/members
 *
 * Lists all members (including pending invites) of the signed-in publisher's org.
 */
export async function GET(): Promise<NextResponse> {
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

    // Resolve the publisher's org.
    const { data: org } = await admin
        .from("organizations")
        .select("id, name")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (!org) {
        return apiError("ORG_NOT_FOUND", "No organisation found for this publisher", 404);
    }

    const { data: members, error } = await admin
        .from("org_members")
        .select(
            "id, publisher_id, role, invited_email, invited_at, joined_at, invited_by, publishers!org_members_publisher_id_fkey(display_name, wallet_address)",
        )
        .eq("org_id", org.id)
        .order("invited_at", { ascending: true });

    if (error) {
        console.error("[org/members] list error", error);
        return apiError("DATABASE_ERROR", "Failed to fetch members", 500);
    }

    return NextResponse.json({ members: members ?? [], org: { id: org.id, name: org.name } });
}

/**
 * POST /api/v1/org/members
 *
 * Invites a new member to the org by email.
 * - Creates an org_invite row with a secure random token.
 * - Sends the invite email via Resend.
 * - Only the owner or an admin may invite.
 */
export async function POST(request: Request): Promise<NextResponse> {
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

    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();

    // Resolve the publisher's org.
    const { data: org } = await admin
        .from("organizations")
        .select("id, name")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (!org) {
        return apiError("ORG_NOT_FOUND", "Create an organisation before inviting members", 404);
    }

    // Verify the inviter is owner or admin.
    const { data: inviterMember } = await admin
        .from("org_members")
        .select("role")
        .eq("org_id", org.id)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (!inviterMember || !["owner", "admin"].includes(inviterMember.role)) {
        return apiError("FORBIDDEN", "Only the owner or an admin may invite members", 403);
    }

    // Check for a duplicate active invite.
    const { data: existingInvite } = await admin
        .from("org_invites")
        .select("id, accepted_at, expires_at")
        .eq("org_id", org.id)
        .eq("invited_email", parsed.data.email)
        .maybeSingle();

    if (existingInvite) {
        const isExpired = new Date(existingInvite.expires_at) < new Date();
        const isAccepted = !!existingInvite.accepted_at;
        if (!isExpired && !isAccepted) {
            return apiError("INVITE_ALREADY_SENT", "An active invite already exists for this email", 409);
        }
        // Expired or already accepted — allow re-invite by deleting the old record.
        await admin.from("org_invites").delete().eq("id", existingInvite.id);
    }

    // Generate secure invite token.
    const token = randomBytes(32).toString("hex");

    const { data: invite, error: inviteError } = await admin
        .from("org_invites")
        .insert({
            org_id: org.id,
            invited_email: parsed.data.email,
            role: parsed.data.role,
            token,
            invited_by: auth.publisher.id,
        })
        .select("id, invited_email, role, expires_at")
        .single();

    if (inviteError ?? !invite) {
        console.error("[org/members] invite insert error", inviteError);
        return apiError("DATABASE_ERROR", "Failed to create invite", 500);
    }

    // Send invite email (non-blocking — failure doesn't fail the API call).
    const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard/accept-invite?token=${token}`;
    const inviterName = auth.publisher.display_name ?? auth.publisher.wallet_address.slice(0, 8) + "…";
    await sendInviteEmail({
        to: parsed.data.email,
        inviterName,
        orgName: org.name,
        role: parsed.data.role,
        acceptUrl,
    });

    return NextResponse.json({ invite }, { status: 201 });
}
