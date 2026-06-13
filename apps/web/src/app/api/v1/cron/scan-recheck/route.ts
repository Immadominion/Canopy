import type { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recheckByHash } from "@/lib/malware/virustotal";

export const runtime = "nodejs";
export const maxDuration = 60;

// Don't re-check a scan the upload route just kicked off; give it a head start.
const MIN_AGE_MS = 2 * 60 * 1000;
// Cap per run — each track costs exactly ONE VirusTotal call (a hash lookup),
// so this also bounds quota use (free tier: 4 req/min, 500/day).
const BATCH = 5;

const cronLog = logger.child({ cron: "scan-recheck" });

/**
 * GET /api/v1/cron/scan-recheck
 *
 * Safety net for the malware scan. Called periodically by Vercel Cron (see
 * vercel.json), secured by CRON_SECRET.
 *
 * VirusTotal's analysis of a brand-new APK often takes longer than the upload
 * scan's poll window, after which the build is left waiting. The file has
 * already been submitted to VT, so this cron just does a cheap **hash lookup**
 * (one API call per build — NOT a re-upload or a poll loop) and settles any
 * build whose analysis VT has finished. Quota-light by design.
 *
 * Returns: { checked, passed, failed, pending, errors }
 */
export async function GET(request: NextRequest): Promise<Response> {
    if (env.NODE_ENV === "production") {
        const authHeader = request.headers.get("authorization");
        if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
            return new Response("Unauthorized", { status: 401 });
        }
    }

    const vtKey = env.VIRUSTOTAL_API_KEY;
    if (!vtKey) return Response.json({ skipped: "no_vt_key" });

    const admin = createSupabaseAdminClient();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const beforeIso = new Date(now - MIN_AGE_MS).toISOString();

    const { data: outstanding, error } = await admin
        .from("beta_tracks")
        .select("id, apk_sha256")
        .in("status", ["pending_scan", "scan_in_progress"])
        .lt("updated_at", beforeIso)
        .gt("expires_at", nowIso)
        .is("apk_deleted_at", null)
        .order("updated_at", { ascending: true })
        .limit(BATCH);

    if (error) {
        cronLog.error({ err: error }, "Failed to fetch outstanding scans");
        return Response.json({ error: error.message }, { status: 500 });
    }

    let passed = 0;
    let failed = 0;
    let pending = 0;
    const errors: string[] = [];

    for (const track of outstanding ?? []) {
        try {
            const result = await recheckByHash(track.apk_sha256, vtKey);
            if (result === "pending") {
                pending++;
                continue;
            }
            if (result.outcome === "clean") {
                await admin.from("beta_tracks").update({ status: "scan_passed" }).eq("id", track.id);
                passed++;
            } else if (result.outcome === "malicious") {
                await admin.from("beta_tracks").update({ status: "scan_failed" }).eq("id", track.id);
                failed++;
            } else {
                // unavailable / rate-limited — try again next run.
                pending++;
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            cronLog.error({ trackId: track.id, err }, "Recheck failed");
            errors.push(`${track.id}: ${msg}`);
        }
    }

    const summary = { checked: outstanding?.length ?? 0, passed, failed, pending, errors };
    cronLog.info(summary, "scan-recheck complete");
    return Response.json(summary);
}
