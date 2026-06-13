"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a track is mid-scan, refresh the server component on an interval so the
 * status flips to scan_passed / scan_failed / active the moment it changes —
 * without the user manually reloading. Renders nothing.
 */
const POLLING_STATUSES = new Set(["pending_scan", "scan_in_progress"]);

export function TrackStatusPoller({
    status,
    intervalMs = 5000,
}: {
    status: string;
    intervalMs?: number;
}) {
    const router = useRouter();

    useEffect(() => {
        if (!POLLING_STATUSES.has(status)) return;
        const id = setInterval(() => router.refresh(), intervalMs);
        return () => clearInterval(id);
    }, [status, intervalMs, router]);

    return null;
}
