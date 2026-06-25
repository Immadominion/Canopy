"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a track is mid-scan, ask the server to re-check VirusTotal on an interval
 * (a cheap hash lookup that settles the track the moment the analysis is done),
 * then refresh the server component so the status flips to scan_passed /
 * scan_failed without the user reloading or clicking anything.
 *
 * This is what actually moves a stuck scan forward: VirusTotal often takes a few
 * minutes on a brand-new build — longer than the upload-time scan can wait — so
 * without this poll the track would sit at "scanning" until the (daily) recheck
 * cron ran. The interval is kept modest to respect VirusTotal's free-tier quota
 * (4 req/min); recheck no-ops gracefully if rate-limited.
 */
const POLLING_STATUSES = new Set(["pending_scan", "scan_in_progress"]);

export function TrackStatusPoller({
    trackId,
    status,
    intervalMs = 20000,
}: {
    trackId: string;
    status: string;
    intervalMs?: number;
}) {
    const router = useRouter();

    useEffect(() => {
        if (!POLLING_STATUSES.has(status)) return;
        let cancelled = false;

        const tick = async (): Promise<void> => {
            try {
                await fetch(`/api/v1/beta/${trackId}/recheck`, { method: "POST" });
            } catch {
                // transient — try again next tick
            }
            if (!cancelled) router.refresh();
        };

        const id = setInterval(() => {
            void tick();
        }, intervalMs);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [trackId, status, intervalMs, router]);

    return null;
}
