import { logger } from "@/lib/logger";
import { deleteApkFromR2 } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Admin-initiated beta-track mutations for the Telegram console. These mirror
 * the owner-only HTTP routes but run through the service-role client (the bot
 * authenticates via the admin-chat gate, not SIWS).
 *
 * Both operations preserve the anti-shadow-store guardrails:
 *  - revoke is terminal and purges the APK from R2 (no lingering distribution)
 *  - extend is hard-clamped to created_at + 30 days in code, and the DB CHECK
 *    (expires_at <= created_at + 30 days) is the final backstop.
 */

const log = logger.child({ module: "beta/admin-ops" });

const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RevokeResult =
    | { ok: true }
    | { ok: false; reason: "not_found" | "already_revoked" | "db_error" };

/** Revoke a track: status -> 'revoked' and purge its APK from R2 (best-effort). */
export async function revokeTrack(trackId: string): Promise<RevokeResult> {
    const admin = createSupabaseAdminClient();

    const { data: track } = await admin
        .from("beta_tracks")
        .select("id, status, r2_key, apk_deleted_at")
        .eq("id", trackId)
        .maybeSingle();

    if (!track) return { ok: false, reason: "not_found" };
    if (track.status === "revoked") return { ok: false, reason: "already_revoked" };

    const { error } = await admin
        .from("beta_tracks")
        .update({ status: "revoked" })
        .eq("id", trackId);

    if (error) {
        log.warn({ err: error, trackId }, "Failed to revoke track");
        return { ok: false, reason: "db_error" };
    }

    // Revoking is terminal — purge the now-dead binary immediately (best-effort).
    if (!track.apk_deleted_at) {
        try {
            await deleteApkFromR2(track.r2_key);
            await admin
                .from("beta_tracks")
                .update({ apk_deleted_at: new Date().toISOString() })
                .eq("id", trackId);
        } catch (err) {
            log.warn({ err, trackId }, "R2 purge failed during bot revoke");
        }
    }

    log.info({ trackId }, "Track revoked via admin bot");
    return { ok: true };
}

export type ExtendResult =
    | { ok: true; newExpiry: string; capped: boolean }
    | { ok: false; reason: "not_found" | "terminal" | "expired" | "db_error" };

/**
 * Extend a track's expiry by `days`, clamped to created_at + 30 days. Cannot
 * extend a terminal (revoked/expired) or already-expired track.
 */
export async function extendTrackExpiry(trackId: string, days: number): Promise<ExtendResult> {
    const admin = createSupabaseAdminClient();

    const { data: track } = await admin
        .from("beta_tracks")
        .select("id, status, expires_at, created_at")
        .eq("id", trackId)
        .maybeSingle();

    if (!track) return { ok: false, reason: "not_found" };
    if (track.status === "revoked" || track.status === "expired") {
        return { ok: false, reason: "terminal" };
    }
    if (new Date(track.expires_at).getTime() < Date.now()) {
        return { ok: false, reason: "expired" };
    }

    const hardCap = new Date(track.created_at).getTime() + MAX_LIFETIME_MS; // guardrail #3
    const requested = new Date(track.expires_at).getTime() + days * DAY_MS;
    const capped = requested > hardCap;
    const newExpiry = new Date(Math.min(requested, hardCap)).toISOString();

    const { error } = await admin
        .from("beta_tracks")
        .update({ expires_at: newExpiry })
        .eq("id", trackId);

    if (error) {
        log.warn({ err: error, trackId }, "Failed to extend track expiry");
        return { ok: false, reason: "db_error" };
    }

    log.info({ trackId, days, newExpiry, capped }, "Track expiry extended via admin bot");
    return { ok: true, newExpiry, capped };
}
