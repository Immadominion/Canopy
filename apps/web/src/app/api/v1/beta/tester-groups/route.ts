import { NextResponse } from "next/server";
import { z } from "zod";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const createSchema = z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
});

/**
 * GET /api/v1/beta/tester-groups
 *
 * Reusable tester groups owned by the authenticated publisher — a named,
 * persistent list of tester wallets that can be attached to any track. Returns
 * lightweight summaries (no wallet data). Powers the Groups dashboard and the
 * "Add from group" picker on the track testers screen.
 */
export async function GET(): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from("tester_groups")
        .select("id, name, description, member_count, org_id, updated_at")
        .eq("publisher_id", auth.publisher.id)
        .order("updated_at", { ascending: false });

    if (error) return apiError("DB_ERROR", "Failed to load tester groups", 500);

    const groups = (data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        memberCount: g.member_count,
        orgId: g.org_id,
        updatedAt: g.updated_at,
    }));
    return NextResponse.json({ groups });
}

/**
 * POST /api/v1/beta/tester-groups
 *
 * Body: { name, description? }. Creates an empty publisher-scoped group. Group
 * names are unique per publisher (case-insensitive) — a duplicate returns 409.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from("tester_groups")
        .insert({
            publisher_id: auth.publisher.id,
            name: parsed.data.name,
            description: parsed.data.description ?? null,
        })
        .select("id")
        .single();

    if (error) {
        // 23505 = unique_violation on (publisher_id, lower(name)).
        if (error.code === "23505") {
            return apiError("GROUP_NAME_TAKEN", "A group with this name already exists", 409);
        }
        return apiError("DB_ERROR", "Failed to create tester group", 500);
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
}
