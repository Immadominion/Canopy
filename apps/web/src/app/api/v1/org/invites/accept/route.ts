import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const acceptInviteSchema = z.object({
    token: z.string().trim().min(1),
});

/**
 * POST /api/v1/org/invites/accept
 *
 * Accepts a pending org invitation.
 *
 * - The caller must be authenticated as a publisher (KYC not required).
 * - The token must be valid, not expired, and not yet accepted.
 * - Creates an org_member row and marks the invite as accepted.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const publisher = await getCurrentPublisher();
    if (!publisher) {
        return apiError("UNAUTHENTICATED", "Sign in to accept this invitation", 401);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = acceptInviteSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid token", 400);
    }

    const admin = createSupabaseAdminClient();

    // Look up the invite by token.
    const { data: invite } = await admin
        .from("org_invites")
        .select("id, org_id, invited_email, role, expires_at, accepted_at")
        .eq("token", parsed.data.token)
        .maybeSingle();

    // Return 404 for any token issue — never reveal whether a token exists.
    if (!invite) {
        return apiError("INVITE_NOT_FOUND", "Invitation not found or has already been used", 404);
    }

    if (invite.accepted_at) {
        return apiError("INVITE_ALREADY_ACCEPTED", "This invitation has already been used", 409);
    }

    if (new Date(invite.expires_at) < new Date()) {
        return apiError("INVITE_EXPIRED", "This invitation has expired", 410);
    }

    // Check publisher is not already a member.
    const { data: existingMember } = await admin
        .from("org_members")
        .select("id")
        .eq("org_id", invite.org_id)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (existingMember) {
        // Already a member — mark invite accepted anyway and return success.
        await admin.from("org_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
        return NextResponse.json({ message: "Already a member of this organisation" });
    }

    const now = new Date().toISOString();

    // Create the member row.
    const { error: memberError } = await admin.from("org_members").insert({
        org_id: invite.org_id,
        publisher_id: publisher.id,
        role: invite.role,
        invited_email: invite.invited_email,
        invited_by: publisher.id, // placeholder — actual inviter stored in org_invites
        invited_at: now,
        joined_at: now,
    });

    if (memberError) {
        console.error("[invites/accept] member insert error", memberError);
        return apiError("DATABASE_ERROR", "Failed to join organisation", 500);
    }

    // Mark invite as accepted.
    await admin.from("org_invites").update({ accepted_at: now }).eq("id", invite.id);

    return NextResponse.json({ message: "Invitation accepted", org_id: invite.org_id });
}
