import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const log = logger.child({ route: "POST /api/v1/beta/[trackId]/groups" });

interface RouteParams {
    params: Promise<{ trackId: string }>;
}

const attachSchema = z.object({ groupId: z.string().uuid() });

/**
 * GET /api/v1/beta/[trackId]/groups
 *
 * The tester groups attached to this track (provenance), owner-only. Powers the
 * "Attached groups" panel on the track testers screen.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    const admin = createSupabaseAdminClient();
    const { data: track } = await admin
        .from("beta_tracks")
        .select("id, publisher_id")
        .eq("id", trackId)
        .maybeSingle();
    if (!track || track.publisher_id !== auth.publisher.id) return notFound();

    const { data: links, error } = await admin
        .from("beta_track_group_links")
        .select("group_id, members_added, partial, attached_at")
        .eq("track_id", trackId)
        .order("attached_at", { ascending: false });

    if (error) return apiError("DB_ERROR", "Failed to load attached groups", 500);

    // Resolve group names in a second query (the hand-maintained Database types
    // declare no Relationships for these tables, so a PostgREST embed won't type).
    const groupIds = [...new Set((links ?? []).map((l) => l.group_id))];
    const nameById = new Map<string, string>();
    if (groupIds.length > 0) {
        const { data: namedGroups } = await admin
            .from("tester_groups")
            .select("id, name")
            .in("id", groupIds);
        for (const g of namedGroups ?? []) nameById.set(g.id, g.name);
    }

    const groups = (links ?? []).map((l) => ({
        groupId: l.group_id,
        name: nameById.get(l.group_id) ?? "Unknown group",
        membersAdded: l.members_added,
        partial: l.partial,
        attachedAt: l.attached_at,
    }));
    return NextResponse.json({ groups });
}

/**
 * POST /api/v1/beta/[trackId]/groups
 *
 * Body: { groupId }. Attaches a tester group to the track — MATERIALIZES the
 * group's members into beta_testers through the same 200-cap CAS used by manual
 * add (via the apply_tester_group_to_track RPC). Idempotent: re-attaching an
 * already-attached group tops the track up with members added since (existing
 * rows dedupe-skip). Partial fill (group larger than the remaining cap) is a
 * SUCCESS with a warning, not an error.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }
    const parsed = attachSchema.safeParse(raw);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }
    const { groupId } = parsed.data;

    const admin = createSupabaseAdminClient();

    // Track must exist, be owned by the caller, and accept new testers.
    const { data: track } = await admin
        .from("beta_tracks")
        .select("id, publisher_id, status, expires_at")
        .eq("id", trackId)
        .maybeSingle();
    if (!track || track.publisher_id !== auth.publisher.id) return notFound();
    if (track.status === "revoked" || track.status === "expired") {
        return apiError("TRACK_INACTIVE", "Track is not accepting new testers", 409);
    }
    if (new Date(track.expires_at).getTime() < Date.now()) {
        return apiError("TRACK_EXPIRED", "Track is expired", 409);
    }

    // Group must exist and be owned by the caller.
    const { data: group } = await admin
        .from("tester_groups")
        .select("id, publisher_id")
        .eq("id", groupId)
        .maybeSingle();
    if (!group || group.publisher_id !== auth.publisher.id) return notFound();

    // Materialize the group into beta_testers through the 200-cap CAS.
    const { data: applied, error: applyErr } = await admin.rpc("apply_tester_group_to_track", {
        p_track_id: trackId,
        p_group_id: groupId,
        p_actor_publisher_id: auth.publisher.id,
    });
    const row = applied?.[0];
    if (applyErr || !row) {
        log.error({ trackId, groupId, err: applyErr }, "apply_tester_group_to_track failed");
        return apiError("DB_ERROR", "Failed to apply group to track", 500);
    }

    // Record / refresh provenance (idempotent on re-attach).
    const { error: linkErr } = await admin.from("beta_track_group_links").upsert(
        {
            track_id: trackId,
            group_id: groupId,
            attached_by_publisher_id: auth.publisher.id,
            members_added: row.added,
            partial: row.over_cap,
            attached_at: new Date().toISOString(),
        },
        { onConflict: "track_id,group_id" },
    );
    if (linkErr) {
        log.warn({ trackId, groupId, err: linkErr }, "Failed to record group attach provenance");
    }

    return NextResponse.json(
        {
            added: row.added,
            alreadyPresent: row.already_present,
            remainingInGroup: row.remaining_in_group,
            capReached: row.over_cap,
            warning: row.over_cap
                ? `Added ${String(row.added)} tester(s); the track reached its cap before the whole group was applied.`
                : undefined,
        },
        { status: 201 },
    );
}
