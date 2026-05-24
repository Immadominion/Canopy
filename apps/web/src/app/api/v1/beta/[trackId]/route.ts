import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { getSessionWallet, requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ trackId: string }>;
}

const patchSchema = z.object({
    status: z.enum(["active", "revoked"]).optional(),
    releaseNotes: z.string().max(2000).nullable().optional(),
});

/**
 * GET /api/v1/beta/[trackId]
 *
 * Returns the track if the caller is:
 *   - the owning publisher, OR
 *   - a tester on the allowlist for this track
 *
 * Any other request — including unauthenticated — returns 404 (Invariant 5).
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return notFound();

    const admin = createSupabaseAdminClient();

    const { data: track, error } = await admin
        .from("beta_tracks")
        .select(
            "id, app_id, publisher_id, version_name, version_code, apk_sha256, apk_size_bytes, tester_cap, tester_count, status, release_notes, expires_at, created_at, updated_at",
        )
        .eq("id", trackId)
        .maybeSingle();

    if (error || !track) return notFound();

    const session = await getSessionWallet();
    if (!session) return notFound();

    // Is the caller the owning publisher?
    const { data: publisher } = await admin
        .from("publishers")
        .select("id")
        .eq("wallet_hash", session.walletHash)
        .maybeSingle();

    const isOwner = publisher?.id === track.publisher_id;

    let isTester = false;
    if (!isOwner) {
        const { data: tester } = await admin
            .from("beta_testers")
            .select("id")
            .eq("track_id", trackId)
            .eq("wallet_hash", session.walletHash)
            .maybeSingle();
        isTester = tester != null;
    }

    if (!isOwner && !isTester) return notFound();

    // Owner sees everything; testers see a redacted view (no r2 internal data).
    if (isOwner) {
        return NextResponse.json({ track });
    }

    return NextResponse.json({
        track: {
            id: track.id,
            appId: track.app_id,
            versionName: track.version_name,
            versionCode: track.version_code,
            apkSha256: track.apk_sha256,
            apkSizeBytes: track.apk_size_bytes,
            status: track.status,
            releaseNotes: track.release_notes,
            expiresAt: track.expires_at,
        },
    });
}

/**
 * PATCH /api/v1/beta/[trackId]
 *
 * Owner-only. Supports:
 *   - status: "active" (typically called after malware scan completes)
 *   - status: "revoked"
 *   - releaseNotes (string | null)
 *
 * Activation requires the track to be in `pending_scan` and have a successful scan.
 * (Scan workflow is async — for now we accept the activation if the publisher requests
 * it, but in production this must be gated on a verified scan completion record.)
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();
    const { data: track, error } = await admin
        .from("beta_tracks")
        .select("id, publisher_id, status, expires_at")
        .eq("id", trackId)
        .maybeSingle();

    if (error || !track) return notFound();
    if (track.publisher_id !== auth.publisher.id) return notFound();

    // Cannot mutate an expired track
    if (new Date(track.expires_at).getTime() < Date.now()) {
        return apiError("TRACK_EXPIRED", "Track is expired and cannot be modified", 409);
    }

    const update: { status?: "active" | "revoked"; release_notes?: string | null } = {};

    if (parsed.data.status === "active") {
        // INVARIANT: A track can only be activated after a clean malware scan.
        // Valid activation path: scan_passed → active
        if (track.status !== "scan_passed") {
            const hint =
                track.status === "pending_scan" || track.status === "scan_in_progress"
                    ? "Track scan is still in progress"
                    : track.status === "scan_failed"
                        ? "Track failed malware scan and cannot be activated"
                        : `Cannot activate track in status '${track.status}'`;
            return apiError("INVALID_STATE_TRANSITION", hint, 409);
        }
        update.status = "active";
    } else if (parsed.data.status === "revoked") {
        update.status = "revoked";
    }

    if (parsed.data.releaseNotes !== undefined) {
        update.release_notes = parsed.data.releaseNotes;
    }

    if (Object.keys(update).length === 0) {
        return apiError("NO_CHANGES", "No mutable fields provided", 400);
    }

    const { data: updated, error: updateError } = await admin
        .from("beta_tracks")
        .update(update)
        .eq("id", trackId)
        .select("id, status, release_notes, updated_at")
        .single();

    if (updateError || !updated) {
        return apiError("DB_ERROR", "Failed to update track", 500);
    }

    return NextResponse.json({ track: updated });
}
