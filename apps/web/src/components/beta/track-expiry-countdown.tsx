"use client";

import { useEffect, useState } from "react";

interface Props {
    expiresAt: string; // ISO 8601
    /** Total duration of the track in ms (created_at to expires_at). Used for progress bar. */
    totalDurationMs: number;
}

function formatRemaining(remainingMs: number): string {
    if (remainingMs <= 0) return "EXPIRED";
    const days = Math.floor(remainingMs / 86_400_000);
    const hours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
    const mins = Math.floor((remainingMs % 3_600_000) / 60_000);
    if (days > 0) return `${days}D ${hours}H REMAINING`;
    if (hours > 0) return `${hours}H ${mins}M REMAINING`;
    return `${mins}M REMAINING`;
}

/**
 * Live expiry countdown for a beta track.
 *
 * Nothing Design:
 * - Space Mono, ALL CAPS — data always in monospace
 * - Thin 1px progress bar (no gradients, no shadows)
 * - Colour transitions: default secondary → accent-warning at < 2 days → accent at expired
 * - No toast or skeleton — just the raw data
 */
export function TrackExpiryCountdown({ expiresAt, totalDurationMs }: Props) {
    const expiresMs = new Date(expiresAt).getTime();

    const [remainingMs, setRemainingMs] = useState(() => expiresMs - Date.now());

    useEffect(() => {
        // Update every 60 seconds — minute precision is sufficient
        const interval = setInterval(() => {
            setRemainingMs(expiresMs - Date.now());
        }, 60_000);
        return () => clearInterval(interval);
    }, [expiresMs]);

    const isExpired = remainingMs <= 0;
    const isCritical = !isExpired && remainingMs < 2 * 86_400_000; // < 2 days

    // Percentage of time elapsed: 0% = just created, 100% = expired
    const elapsed = Math.max(0, Math.min(1, 1 - remainingMs / totalDurationMs));

    const label = formatRemaining(remainingMs);

    return (
        <div className="w-full">
            {/* Label row */}
            <div className="flex items-center justify-between mb-[6px]">
                <span
                    className={[
                        "font-mono text-nd-label uppercase tracking-[0.08em]",
                        isExpired
                            ? "text-nd-text-disabled"
                            : isCritical
                                ? "text-nd-accent"
                                : "text-nd-text-secondary",
                    ].join(" ")}
                >
                    {label}
                </span>
                <span className="font-mono text-nd-caption text-nd-text-disabled tracking-[0.06em]">
                    {new Date(expiresAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                    }).toUpperCase()}
                </span>
            </div>

            {/* Progress bar — thin 1px track with filled portion */}
            <div className="w-full h-px bg-nd-border" aria-hidden="true">
                <div
                    className={[
                        "h-full transition-all duration-500",
                        isExpired
                            ? "bg-nd-text-disabled"
                            : isCritical
                                ? "bg-nd-accent"
                                : "bg-nd-text-secondary",
                    ].join(" ")}
                    style={{ width: `${(elapsed * 100).toFixed(1)}%` }}
                />
            </div>
        </div>
    );
}
