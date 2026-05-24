import type { NextRequest } from "next/server";

import { deleteApkFromR2 } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — may need to process many tracks

const BATCH_SIZE = 50;

/**
 * GET /api/v1/cron/expire-cleanup
 *
 * Cron endpoint — called hourly by Vercel Cron (configured in vercel.json).
 * Secured by CRON_SECRET: Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 *
 * What it does:
 *  1. Force-expires any tracks that have passed `expires_at` but are not yet
 *     in a terminal status (belt-and-suspenders alongside the pg_cron SQL job).
 *  2. Deletes APKs from R2 for all tracks with `status = 'expired'` and
 *     `apk_deleted_at IS NULL` (Invariant 3: expired APKs must be deleted).
 *  3. Marks each cleaned track with `apk_deleted_at = now()` (idempotency).
 *
 * Returns: { forceExpired, deleted, errors }
 */
export async function GET(request: NextRequest): Promise<Response> {
    // ── Security: verify the Vercel CRON_SECRET ──────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = env.CRON_SECRET;

    // In production, CRON_SECRET must be set and must match.
    // In development, allow the call to proceed without a secret so local testing works.
    if (env.NODE_ENV === "production") {
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            return new Response("Unauthorized", { status: 401 });
        }
    }

    const admin = createSupabaseAdminClient();
    const cronLogger = logger.child({ cron: "expire-cleanup" });

    let forceExpiredCount = 0;
    let deletedCount = 0;
    const errors: string[] = [];

    // ── Step 1: Force-expire overdue tracks (belt-and-suspenders) ─────────────
    // The pg_cron SQL job already does this hourly, but we duplicate it here to
    // handle any race conditions and to work without Supabase Pro plan features.
    const { data: overdueRows, error: expireErr } = await admin
        .from("beta_tracks")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .lt("expires_at", new Date().toISOString())
        .in("status", ["pending_scan", "scan_in_progress", "scan_passed", "active"])
        .select("id");

    if (expireErr) {
        cronLogger.error({ err: expireErr }, "Failed to force-expire overdue tracks");
        errors.push(`force-expire: ${expireErr.message}`);
    } else {
        forceExpiredCount = overdueRows?.length ?? 0;
        if (forceExpiredCount > 0) {
            cronLogger.info({ count: forceExpiredCount }, "Force-expired overdue tracks");
        }
    }

    // ── Step 2: Delete APKs from R2 for expired tracks ────────────────────────
    // Process in batches to stay within the function timeout budget.
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const { data: tracksToClean, error: fetchErr } = await admin
            .from("beta_tracks")
            .select("id, r2_key")
            .eq("status", "expired")
            .is("apk_deleted_at", null)
            .range(offset, offset + BATCH_SIZE - 1);

        if (fetchErr) {
            cronLogger.error({ err: fetchErr }, "Failed to fetch tracks for R2 cleanup");
            errors.push(`fetch: ${fetchErr.message}`);
            break;
        }

        if (!tracksToClean || tracksToClean.length === 0) {
            hasMore = false;
            break;
        }

        // Delete each APK from R2 — individual calls are fine at this batch size
        for (const track of tracksToClean) {
            try {
                await deleteApkFromR2(track.r2_key);

                // Mark deletion complete — idempotent if called twice
                const { error: markErr } = await admin
                    .from("beta_tracks")
                    .update({ apk_deleted_at: new Date().toISOString() })
                    .eq("id", track.id);

                if (markErr) {
                    cronLogger.warn({ trackId: track.id, err: markErr }, "R2 deleted but failed to mark apk_deleted_at");
                    errors.push(`mark ${track.id}: ${markErr.message}`);
                } else {
                    deletedCount++;
                    cronLogger.info({ trackId: track.id, r2Key: track.r2_key }, "APK deleted from R2");
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                cronLogger.error({ trackId: track.id, r2Key: track.r2_key, err }, "Failed to delete APK from R2");
                errors.push(`delete ${track.id}: ${msg}`);
            }
        }

        offset += BATCH_SIZE;
        hasMore = tracksToClean.length === BATCH_SIZE;
    }

    const summary = { forceExpired: forceExpiredCount, deleted: deletedCount, errors };
    cronLogger.info(summary, "Expire-cleanup cron complete");

    return Response.json(summary);
}
