import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Publisher ban / unban — the founder's block switch, exposed via the Telegram
 * admin bot (and reusable elsewhere).
 *
 * Ban sets publishers.verification_status='banned'. Because access_requests has
 * a CHECK forbidding 'banned' AND a partial unique index allowing only one
 * pending request per publisher, we also close any open pending request
 * (-> 'rejected') so the ban is clean and a future re-request behaves sanely.
 *
 * Ban is the gate, not a cascade: it stops the publisher passing the
 * verified-publisher gate (no new apps/tracks/testers). Their existing tracks
 * still age out under the hard 30-day expiry — revoke individually with
 * /revoke if you need an immediate kill.
 */

const log = logger.child({ module: "publisher-ban" });

export async function banPublisher(
    publisherId: string,
    bannedBy: string,
): Promise<{ ok: boolean }> {
    const admin = createSupabaseAdminClient();
    const nowIso = new Date().toISOString();

    // Close any open pending request first (status CHECK forbids 'banned').
    await admin
        .from("access_requests")
        .update({ status: "rejected", decided_at: nowIso, decided_by: bannedBy })
        .eq("publisher_id", publisherId)
        .eq("status", "pending");

    const { error } = await admin
        .from("publishers")
        .update({ verification_status: "banned" })
        .eq("id", publisherId);

    if (error) {
        log.warn({ err: error, publisherId }, "Failed to ban publisher");
        return { ok: false };
    }
    log.info({ publisherId, bannedBy }, "Publisher banned");
    return { ok: true };
}

export async function unbanPublisher(
    publisherId: string,
    unbannedBy: string,
): Promise<{ ok: boolean }> {
    const admin = createSupabaseAdminClient();

    // Reset to 'unverified' so the normal request/approve flow can re-open.
    const { error } = await admin
        .from("publishers")
        .update({ verification_status: "unverified" })
        .eq("id", publisherId)
        .eq("verification_status", "banned");

    if (error) {
        log.warn({ err: error, publisherId }, "Failed to unban publisher");
        return { ok: false };
    }
    log.info({ publisherId, unbannedBy }, "Publisher unbanned");
    return { ok: true };
}
