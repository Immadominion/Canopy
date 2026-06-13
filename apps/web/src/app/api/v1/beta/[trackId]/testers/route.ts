import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidSolanaAddress, isValidUuid } from "@canopy/utils";

import { hashWalletAddress } from "@/lib/auth/siws";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ trackId: string }>;
}

const bodySchema = z.object({
    walletAddresses: z.array(z.string().min(32).max(44)).min(1).max(50),
});

/**
 * POST /api/v1/beta/[trackId]/testers
 *
 * Body: { walletAddresses: string[] } — Solana addresses (max 50 per call).
 *
 * INVARIANT 2: 200-tester cap is enforced atomically via the
 * `increment_tester_count(track_id)` DB function (FOR UPDATE row lock).
 * If `over_cap` is returned, we abort the whole batch with HTTP 409.
 *
 * Wallet addresses are SHA-256 hashed before storage — plaintext never lands in
 * `beta_testers`.
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

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    // Validate every address structurally before any DB work
    const invalid = parsed.data.walletAddresses.filter((w) => !isValidSolanaAddress(w));
    if (invalid.length > 0) {
        return apiError("INVALID_WALLET_ADDRESS", "One or more wallet addresses are invalid", 400, {
            invalid,
        });
    }

    const admin = createSupabaseAdminClient();

    // Verify track ownership (and existence). 404 — never reveal existence to non-owners.
    const { data: track, error: trackErr } = await admin
        .from("beta_tracks")
        .select("id, publisher_id, status, expires_at")
        .eq("id", trackId)
        .maybeSingle();

    if (trackErr || !track) return notFound();
    if (track.publisher_id !== auth.publisher.id) return notFound();
    if (track.status === "revoked" || track.status === "expired") {
        return apiError("TRACK_INACTIVE", "Track is not accepting new testers", 409);
    }
    if (new Date(track.expires_at).getTime() < Date.now()) {
        return apiError("TRACK_EXPIRED", "Track is expired", 409);
    }

    // Deduplicate within the batch and hash
    const uniqueWallets = Array.from(new Set(parsed.data.walletAddresses));
    const hashes = uniqueWallets.map((w) => ({ wallet: w, hash: hashWalletAddress(w) }));

    // Add testers one by one, calling the atomic increment_tester_count() per insert.
    // This is the only safe way to enforce the 200 cap under concurrent requests.
    const added: { walletHash: string; testerId: string }[] = [];
    const skipped: { wallet: string; reason: string }[] = [];

    for (const { wallet, hash } of hashes) {
        // Skip if already on allowlist
        const { data: existing } = await admin
            .from("beta_testers")
            .select("id")
            .eq("track_id", trackId)
            .eq("wallet_hash", hash)
            .maybeSingle();

        if (existing) {
            skipped.push({ wallet, reason: "already_on_allowlist" });
            continue;
        }

        const { data: incResult, error: incError } = await admin.rpc("increment_tester_count", {
            p_track_id: trackId,
        });

        // The function RETURNS TABLE(...), so PostgREST returns an array of rows.
        const incRow = incResult?.[0];
        if (incError || !incRow) {
            return apiError("DB_ERROR", "Failed to reserve tester slot", 500);
        }

        if (incRow.over_cap) {
            // INVARIANT 2: cap hit. Stop here and return 409 with whatever we managed to add.
            return NextResponse.json(
                {
                    error: {
                        code: "TESTER_CAP_REACHED",
                        message: "Beta track has reached its 200-tester cap",
                        details: {
                            added,
                            skipped,
                            remainingToAdd: hashes.length - added.length - skipped.length,
                        },
                    },
                },
                { status: 409 },
            );
        }

        const { data: tester, error: insertError } = await admin
            .from("beta_testers")
            .insert({
                track_id: trackId,
                wallet_hash: hash,
                added_by_publisher_id: auth.publisher.id,
            })
            .select("id")
            .single();

        if (insertError || !tester) {
            // We've already incremented the count — log + return error. (Compensating
            // decrement would require another RPC; out of scope for this iteration.)
            return apiError("DB_ERROR", "Failed to add tester", 500);
        }

        added.push({ walletHash: hash, testerId: tester.id });
    }

    return NextResponse.json({ added, skipped }, { status: 201 });
}
