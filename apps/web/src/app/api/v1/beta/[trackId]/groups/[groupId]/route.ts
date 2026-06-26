import { NextResponse } from "next/server";

import { isValidUuid } from "@canopy/utils";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ trackId: string; groupId: string }>;
}

/**
 * DELETE /api/v1/beta/[trackId]/groups/[groupId]
 *
 * Detaches a group from the track (snapshot model): removes the provenance link
 * only. Testers already materialized onto the track from this group STAY — a
 * shipped build's allowlist is never silently revoked by detaching a group.
 * (Per-tester removal is done via the track's testers screen / group editing.)
 */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId, groupId } = await params;
    if (!isValidUuid(trackId) || !isValidUuid(groupId)) return notFound();

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

    const { error } = await admin
        .from("beta_track_group_links")
        .delete()
        .eq("track_id", trackId)
        .eq("group_id", groupId);
    if (error) return apiError("DB_ERROR", "Failed to detach group", 500);

    return NextResponse.json({ detached: true });
}
