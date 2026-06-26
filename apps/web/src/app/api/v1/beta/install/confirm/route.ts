import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { getSessionWallet } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({ trackId: z.string().uuid() });

/**
 * POST /api/v1/beta/install/confirm
 *
 * Body: { trackId }. Called by the tester app after a successful on-device
 * install (PackageInstaller SUCCESS). Logs an `install_confirmed` event for the
 * caller's wallet — the only server-side signal that a build was actually
 * installed (vs merely downloaded). Powers the per-tester roster (Invited →
 * Downloaded → Installed). Best-effort: the install already succeeded, so a
 * failure here is non-fatal to the user.
 *
 * Auth: SIWS session (Bearer for mobile). The caller must be on the track's
 * allowlist — we never log a confirm for a wallet that isn't a tester.
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

    // Confirm the caller is (or was) a tester on this track before logging.
    const { data: tester } = await admin
        .from("beta_testers")
        .select("id")
        .eq("track_id", parsed.data.trackId)
        .eq("wallet_hash", session.walletHash)
        .maybeSingle();
    if (!tester) return notFound();

    const { error } = await admin.from("install_events").insert({
        track_id: parsed.data.trackId,
        wallet_hash: session.walletHash,
        action: "install_confirmed",
    });
    if (error) return apiError("DB_ERROR", "Failed to record install", 500);

    return NextResponse.json({ ok: true });
}
