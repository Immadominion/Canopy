import { NextResponse } from "next/server";

import { isValidUuid } from "@canopy/utils";

import { apiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { scanApk } from "@/lib/malware/virustotal";
import { downloadApkFromR2 } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Scans can take several minutes on VirusTotal free tier
export const maxDuration = 300;

const log = logger.child({ route: "POST /api/v1/beta/[trackId]/scan" });

interface RouteParams {
    params: Promise<{ trackId: string }>;
}

/**
 * POST /api/v1/beta/[trackId]/scan
 *
 * Internal endpoint — triggered fire-and-forget by the upload route.
 * NOT authenticated via normal SIWS; protected by the internal scan secret.
 *
 * Header required: `X-Canopy-Internal: {INTERNAL_SCAN_SECRET}`
 *
 * Workflow:
 *   1. Fetch APK bytes from R2
 *   2. Submit to VirusTotal for scanning
 *   3. Transition track: pending_scan → scan_in_progress → scan_passed | scan_failed
 *
 * INVARIANT: A track MUST NOT be set to `scan_passed` unless VirusTotal
 * reports zero malicious detections. A track set to `scan_failed` cannot
 * be activated by any code path.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return apiError("NOT_FOUND", "Track not found", 404);

    const admin = createSupabaseAdminClient();

    const { data: track, error: trackErr } = await admin
        .from("beta_tracks")
        .select("id, status, apk_sha256, r2_key, publisher_id")
        .eq("id", trackId)
        .eq("status", "pending_scan")
        .maybeSingle();

    if (trackErr || !track) {
        log.warn({ trackId }, "Scan requested for non-existent or non-pending track");
        return apiError("NOT_FOUND", "Track not found or not in pending_scan state", 404);
    }

    // Transition to scan_in_progress immediately
    await admin
        .from("beta_tracks")
        .update({ status: "scan_in_progress" })
        .eq("id", trackId)
        .eq("status", "pending_scan");

    log.info({ trackId, apkSha256: track.apk_sha256 }, "Malware scan started");

    const vtKey = env.VIRUSTOTAL_API_KEY;

    if (!vtKey) {
        log.warn(
            { trackId },
            "VIRUSTOTAL_API_KEY is not set — track cannot be scanned; leaving as scan_in_progress",
        );
        // Do not auto-pass — the track will stay scan_in_progress until the key is set.
        // An operator can manually update via admin.
        return NextResponse.json({ status: "skipped", reason: "No VT API key configured" });
    }

    // Fetch APK from R2 for scanning
    let apkBytes: Buffer;
    try {
        apkBytes = await downloadApkFromR2(track.r2_key);
    } catch (err) {
        log.error({ err, trackId }, "Failed to download APK from R2 for scanning");
        // Do not transition to scan_failed — the download failure is transient.
        await admin
            .from("beta_tracks")
            .update({ status: "pending_scan" })
            .eq("id", trackId);
        return apiError("STORAGE_ERROR", "Failed to retrieve APK for scanning", 502);
    }

    const result = await scanApk(track.apk_sha256, apkBytes, vtKey);

    if (result.outcome === "clean") {
        await admin
            .from("beta_tracks")
            .update({ status: "scan_passed" })
            .eq("id", trackId);
        log.info({ trackId }, "Malware scan passed — track is now scan_passed");
        return NextResponse.json({ status: "scan_passed" });
    }

    if (result.outcome === "malicious") {
        await admin
            .from("beta_tracks")
            .update({ status: "scan_failed" })
            .eq("id", trackId);
        log.error(
            { trackId, maliciousCount: result.maliciousCount, engineCount: result.engineCount },
            "Malware scan FAILED — track set to scan_failed",
        );
        return NextResponse.json({
            status: "scan_failed",
            maliciousCount: result.maliciousCount,
        });
    }

    // outcome === "unavailable" — VT couldn't complete the scan
    log.warn({ trackId, reason: result.reason }, "Malware scan unavailable — reverting to pending_scan");
    await admin
        .from("beta_tracks")
        .update({ status: "pending_scan" })
        .eq("id", trackId);
    return NextResponse.json({ status: "unavailable", reason: result.reason });
}
