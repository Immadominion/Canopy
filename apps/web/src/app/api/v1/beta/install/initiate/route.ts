import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { getSessionWallet } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { generateSignedDownloadUrl } from "@/lib/r2/signed-url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { hasSeekerGenesisToken } from "@/lib/solana/seeker-token";

export const runtime = "nodejs";

const bodySchema = z.object({
    trackId: z.string().uuid(),
});

/**
 * POST /api/v1/beta/install/initiate
 *
 * Body: { trackId: string }
 *
 * The caller must be authenticated (SIWS) — we use their session wallet hash to:
 *   1. Confirm they are on the track's allowlist
 *   2. Bind the signed URL to their wallet (Invariant 4)
 *
 * Returns: { url, expiresAt }
 *
 * 404 is returned for: missing track, expired/revoked track, wallet not on allowlist.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const session = await getSessionWallet();
    if (!session) return apiError("UNAUTHENTICATED", "Sign in with Solana to continue", 401);

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }
    if (!isValidUuid(parsed.data.trackId)) return notFound();

    const admin = createSupabaseAdminClient();

    const { data: track, error: trackErr } = await admin
        .from("beta_tracks")
        .select("id, status, expires_at, seeker_only")
        .eq("id", parsed.data.trackId)
        .maybeSingle();

    if (trackErr || !track) return notFound();
    if (track.status !== "active") return notFound();
    if (new Date(track.expires_at).getTime() < Date.now()) return notFound();

    // ── Seeker gate: if the track requires a Seeker Genesis Token, verify ─────
    if (track.seeker_only) {
        const isSeeker = await hasSeekerGenesisToken(session.walletAddress, session.walletHash);
        if (!isSeeker) {
            return apiError(
                "SEEKER_REQUIRED",
                "This beta track requires a Seeker Genesis Token. Connect a wallet with a Seeker device to continue.",
                403,
            );
        }
    }

    const { data: tester } = await admin
        .from("beta_testers")
        .select("id")
        .eq("track_id", track.id)
        .eq("wallet_hash", session.walletHash)
        .maybeSingle();

    if (!tester) return notFound();

    // Determine the base URL — env first, then request origin
    const baseUrl = (() => {
        if (env.NODE_ENV === "production") {
            return process.env["NEXT_PUBLIC_APP_URL"] ?? new URL(request.url).origin;
        }
        return new URL(request.url).origin;
    })();

    const { url, expiresAt, nonce } = generateSignedDownloadUrl({
        trackId: track.id,
        walletHash: session.walletHash,
        baseUrl,
    });

    // Record the URL issuance — best-effort, do not block on failure.
    await admin.from("install_events").insert({
        track_id: track.id,
        wallet_hash: session.walletHash,
        action: "url_generated",
    });

    return NextResponse.json({
        url,
        expiresAt: expiresAt.toISOString(),
        nonce,
    });
}
