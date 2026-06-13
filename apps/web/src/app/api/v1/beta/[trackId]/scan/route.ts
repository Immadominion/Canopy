import { NextResponse, after } from "next/server";

import { isValidUuid } from "@canopy/utils";

import { apiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { scanApk } from "@/lib/malware/virustotal";
import { notifyDeveloper } from "@/lib/herald/notify";
import { downloadApkFromR2 } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Scans can take several minutes on VirusTotal free tier
export const maxDuration = 300;

const log = logger.child({ route: "POST /api/v1/beta/[trackId]/scan" });

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface RouteParams {
    params: Promise<{ trackId: string }>;
}

interface ScanTrack {
    id: string;
    apk_sha256: string;
    r2_key: string;
    publisher_id: string;
}

/**
 * POST /api/v1/beta/[trackId]/scan
 *
 * Internal endpoint — triggered (via `after()`) by the upload route. Not behind
 * SIWS; it is keyed on the track being in `pending_scan`.
 *
 * Fast-ACKs by atomically claiming the track (pending_scan → scan_in_progress),
 * then runs the slow VirusTotal work in `after()` so it doesn't block the
 * response but still gets this route's full `maxDuration` budget.
 *
 * INVARIANT: a track MUST NOT become `scan_passed` unless VirusTotal reports
 * zero malicious detections. `scan_failed` is terminal.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return apiError("NOT_FOUND", "Track not found", 404);

    const admin = createSupabaseAdminClient();

    // Atomically claim the scan: only one caller can flip pending_scan →
    // scan_in_progress, so a double-trigger can't start two scans.
    const { data: claimed, error: claimErr } = await admin
        .from("beta_tracks")
        .update({ status: "scan_in_progress" })
        .eq("id", trackId)
        .eq("status", "pending_scan")
        .select("id, apk_sha256, r2_key, publisher_id")
        .maybeSingle();

    if (claimErr) {
        log.error({ trackId, err: claimErr }, "Failed to claim track for scanning");
        return apiError("DB_ERROR", "Failed to start scan", 500);
    }
    if (!claimed) {
        // Already scanning / not pending / doesn't exist — nothing to do.
        return NextResponse.json({ status: "not_pending" });
    }

    log.info({ trackId, apkSha256: claimed.apk_sha256 }, "Malware scan started");

    // Heavy VirusTotal work runs after the response, within this route's budget.
    after(() => runScan(admin, claimed));

    return NextResponse.json({ status: "scan_started" });
}

/**
 * Download the APK, run it through VirusTotal, and settle the track status.
 * On a transient failure (R2 download error, VT unavailable) the track is
 * reverted to `pending_scan` so a later trigger can retry.
 */
async function runScan(admin: AdminClient, track: ScanTrack): Promise<void> {
    const vtKey = env.VIRUSTOTAL_API_KEY;
    if (!vtKey) {
        log.warn(
            { trackId: track.id },
            "VIRUSTOTAL_API_KEY is not set — leaving track in scan_in_progress",
        );
        return;
    }

    let apkBytes: Buffer;
    try {
        apkBytes = await downloadApkFromR2(track.r2_key);
    } catch (err) {
        log.error(
            { err, trackId: track.id },
            "Failed to download APK from R2 — reverting to pending_scan",
        );
        await admin.from("beta_tracks").update({ status: "pending_scan" }).eq("id", track.id);
        return;
    }

    const result = await scanApk(track.apk_sha256, apkBytes, vtKey);

    // Resolve the publisher's wallet so we can notify them (no-ops via Herald
    // unless they've opted in — Canopy never stores their contact).
    const { data: pub } = await admin
        .from("publishers")
        .select("wallet_address")
        .eq("id", track.publisher_id)
        .maybeSingle();
    const devWallet = pub?.wallet_address ?? null;

    if (result.outcome === "clean") {
        await admin.from("beta_tracks").update({ status: "scan_passed" }).eq("id", track.id);
        log.info({ trackId: track.id }, "Malware scan passed — track is now scan_passed");
        if (devWallet) {
            await notifyDeveloper({
                wallet: devWallet,
                subject: "Build scan passed",
                body: "Your Canopy beta build passed the malware scan and is ready to activate.",
                category: "system",
                idempotencyKey: `scan_${track.id}_passed`,
            });
        }
        return;
    }

    if (result.outcome === "malicious") {
        await admin.from("beta_tracks").update({ status: "scan_failed" }).eq("id", track.id);
        log.error(
            { trackId: track.id, maliciousCount: result.maliciousCount, engineCount: result.engineCount },
            "Malware scan FAILED — track set to scan_failed",
        );
        if (devWallet) {
            await notifyDeveloper({
                wallet: devWallet,
                subject: "Build scan failed",
                body: "Your Canopy beta build did not pass the malware scan and was blocked.",
                category: "security",
                idempotencyKey: `scan_${track.id}_failed`,
            });
        }
        return;
    }

    // outcome === "unavailable" — VT couldn't complete; revert so it can retry.
    log.warn(
        { trackId: track.id, reason: result.reason },
        "Malware scan unavailable — reverting to pending_scan",
    );
    await admin.from("beta_tracks").update({ status: "pending_scan" }).eq("id", track.id);
}
