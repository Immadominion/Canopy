import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const createOrgSchema = z.object({
    name: z.string().trim().min(2).max(100),
});

/**
 * GET /api/v1/org
 *
 * Returns the organisation owned by the signed-in publisher.
 * 404 if the publisher has not created an org yet.
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
    const { data: org, error } = await admin
        .from("organizations")
        .select("id, name, plan, stripe_customer_id, created_at, updated_at")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (error) {
        console.error("[org] GET error", error);
        return apiError("DATABASE_ERROR", "Failed to fetch organisation", 500);
    }
    if (!org) {
        return apiError("ORG_NOT_FOUND", "No organisation found for this publisher", 404);
    }

    return NextResponse.json({ org });
}

/**
 * POST /api/v1/org
 *
 * Creates an organisation for the signed-in publisher.
 * Each publisher may own at most one org (enforced by DB unique index).
 * The owner is automatically added as the first member with the 'owner' role.
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

    const parsed = createOrgSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();

    // Check if publisher already owns an org.
    const { data: existing } = await admin
        .from("organizations")
        .select("id")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (existing) {
        return apiError("ORG_ALREADY_EXISTS", "Publisher already owns an organisation", 409);
    }

    // Create the org.
    const { data: org, error: orgError } = await admin
        .from("organizations")
        .insert({ name: parsed.data.name, owner_id: auth.publisher.id })
        .select("id, name, plan, created_at, updated_at")
        .single();

    if (orgError ?? !org) {
        console.error("[org] create error", orgError);
        return apiError("DATABASE_ERROR", "Failed to create organisation", 500);
    }

    // Add owner as the first member.
    const { error: memberError } = await admin.from("org_members").insert({
        org_id: org.id,
        publisher_id: auth.publisher.id,
        role: "owner",
        invited_by: auth.publisher.id,
        joined_at: new Date().toISOString(),
    });

    if (memberError) {
        console.error("[org] owner member insert error", memberError);
        // Org exists but member row failed — return partial success with warning.
        return NextResponse.json({ org, warning: "Owner member row failed to insert" }, { status: 201 });
    }

    // Backfill org_id on existing apps owned by this publisher.
    await admin
        .from("apps")
        .update({ org_id: org.id })
        .eq("publisher_id", auth.publisher.id)
        .is("org_id", null);

    return NextResponse.json({ org }, { status: 201 });
}
