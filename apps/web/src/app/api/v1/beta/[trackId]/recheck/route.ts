import { NextResponse } from "next/server";

import { isValidUuid } from "@canopy/utils";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { notFound } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recheckByHash } from "@/lib/malware/virustotal";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const log = logger.child({ route: "POST /api/v1/beta/[trackId]/recheck" });

interface RouteParams {
    params: Promise<{ trackId: string }>;
}

/**
 * POST /api/v1/beta/[trackId]/recheck — owner-only, quota-light scan re-check.
 *
 * Does a SINGLE VirusTotal hash lookup (one API call, no re-upload). If VT has
 * finished analyzing the build, settles the track (scan_passed / scan_failed);
 * otherwise reports it's still pending. Powers the "Check for results" button so
 * a publisher can poll cheaply without re-uploading the APK to VirusTotal.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    const admin = createSupabaseAdminClient();
    const { data: track, error } = await admin
        .from("beta_tracks")
        .select("id, publisher_id, status, apk_sha256")
        .eq("id", trackId)
        .maybeSingle();

    if (error || !track) return notFound();
    if (track.publisher_id !== auth.publisher.id) return notFound();

    // Only meaningful while a scan is outstanding.
    if (track.status !== "pending_scan" && track.status !== "scan_in_progress") {
        return NextResponse.json({ status: track.status, ready: true });
    }

    const vtKey = env.VIRUSTOTAL_API_KEY;
    if (!vtKey) {
        return NextResponse.json({ status: track.status, ready: false, reason: "no_vt_key" });
    }

    // Bound per-publisher recheck volume: each recheck hits VirusTotal's shared
    // daily quota, so an authenticated publisher must not be able to drain it in a
    // scripted loop (a DoS on everyone's scans). Best-effort in-memory speed bump,
    // comfortably above the build page poller's ~3/min. Only reached for tracks
    // still scanning, i.e. calls that actually consume VT quota.
    const rl = rateLimit(`recheck:${auth.publisher.id}`, 12, 60_000);
    if (!rl.allowed) {
        return NextResponse.json(
            { status: track.status, ready: false, reason: "rate_limited" },
            { status: 429, headers: { "Retry-After": rl.retryAfterSeconds.toString() } },
        );
    }

    const result = await recheckByHash(track.apk_sha256, vtKey);

    if (result === "pending") {
        return NextResponse.json({ status: track.status, ready: false });
    }
    if (result.outcome === "clean") {
        await admin.from("beta_tracks").update({ status: "scan_passed" }).eq("id", track.id);
        log.info({ trackId }, "Recheck: VirusTotal result clean — track is scan_passed");
        return NextResponse.json({ status: "scan_passed", ready: true });
    }
    if (result.outcome === "malicious") {
        await admin.from("beta_tracks").update({ status: "scan_failed" }).eq("id", track.id);
        log.warn(
            { trackId, maliciousCount: result.maliciousCount },
            "Recheck: VirusTotal result malicious — track is scan_failed",
        );
        return NextResponse.json({ status: "scan_failed", ready: true });
    }

    // unavailable (rate-limited / transient error) — leave the status untouched.
    return NextResponse.json({ status: track.status, ready: false, reason: result.reason });
}
