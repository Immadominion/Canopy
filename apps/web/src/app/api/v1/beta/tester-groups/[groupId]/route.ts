import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ groupId: string }>;
}

const patchSchema = z
    .object({
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().max(500).nullable().optional(),
    })
    .refine((v) => v.name !== undefined || v.description !== undefined, {
        message: "No fields to update",
    });

/**
 * GET /api/v1/beta/tester-groups/[groupId]
 *
 * Group detail + its members. Members are returned as redacted wallet-hash
 * prefixes (plaintext addresses are never stored, so they cannot be shown);
 * removal is by wallet address via DELETE .../members.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { groupId } = await params;
    if (!isValidUuid(groupId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    const admin = createSupabaseAdminClient();
    const { data: group, error } = await admin
        .from("tester_groups")
        .select("id, publisher_id, name, description, member_count, org_id, created_at, updated_at")
        .eq("id", groupId)
        .maybeSingle();

    if (error || !group) return notFound();
    if (group.publisher_id !== auth.publisher.id) return notFound();

    const { data: members } = await admin
        .from("tester_group_members")
        .select("wallet_hash, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

    return NextResponse.json({
        group: {
            id: group.id,
            name: group.name,
            description: group.description,
            memberCount: group.member_count,
            orgId: group.org_id,
            createdAt: group.created_at,
            updatedAt: group.updated_at,
        },
        members: (members ?? []).map((m) => ({
            walletHashPrefix: m.wallet_hash.slice(0, 16),
            createdAt: m.created_at,
        })),
    });
}

/**
 * PATCH /api/v1/beta/tester-groups/[groupId]
 *
 * Body: { name?, description? }. Rename / edit the group. Duplicate name → 409.
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { groupId } = await params;
    if (!isValidUuid(groupId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();
    // Confirm ownership before mutating (404 — never reveal existence).
    const { data: existing } = await admin
        .from("tester_groups")
        .select("id, publisher_id")
        .eq("id", groupId)
        .maybeSingle();
    if (!existing || existing.publisher_id !== auth.publisher.id) return notFound();

    const update: { name?: string; description?: string | null; updated_at: string } = {
        updated_at: new Date().toISOString(),
    };
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.description !== undefined) update.description = parsed.data.description;

    const { error } = await admin.from("tester_groups").update(update).eq("id", groupId);
    if (error) {
        if (error.code === "23505") {
            return apiError("GROUP_NAME_TAKEN", "A group with this name already exists", 409);
        }
        return apiError("DB_ERROR", "Failed to update tester group", 500);
    }

    return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/v1/beta/tester-groups/[groupId]
 *
 * Deletes the group (cascades its members + track-attach provenance rows).
 * Snapshot model: testers already materialized onto tracks from this group are
 * NOT removed — deleting a group never revokes a shipped build's allowlist.
 */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { groupId } = await params;
    if (!isValidUuid(groupId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin
        .from("tester_groups")
        .select("id, publisher_id")
        .eq("id", groupId)
        .maybeSingle();
    if (!existing || existing.publisher_id !== auth.publisher.id) return notFound();

    const { error } = await admin.from("tester_groups").delete().eq("id", groupId);
    if (error) return apiError("DB_ERROR", "Failed to delete tester group", 500);

    return new NextResponse(null, { status: 204 });
}
