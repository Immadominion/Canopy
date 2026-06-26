"use client";

import { useState } from "react";

function monogram(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * App launcher icon with a guaranteed monogram fallback — an app NEVER renders
 * without a visual. Shows the real icon (auto-extracted from the APK, served at
 * /api/v1/apps/[id]/icon) when available; falls back to the monogram if there's
 * no icon or the image fails to load.
 */
export function AppIcon({
    appId,
    name,
    hasIcon,
    size = 48,
    className = "",
}: {
    appId: string;
    name: string;
    hasIcon: boolean;
    size?: number;
    className?: string;
}) {
    const [failed, setFailed] = useState(false);
    const dims = { width: size, height: size, borderRadius: Math.round(size * 0.22) };

    if (!hasIcon || failed) {
        return (
            <span
                style={{ ...dims, fontSize: Math.round(size * 0.36) }}
                className={`inline-flex items-center justify-center shrink-0 bg-nd-surface-raised border border-nd-border font-mono font-semibold text-nd-text-primary ${className}`}
            >
                {monogram(name)}
            </span>
        );
    }

    return (
        <img
            src={`/api/v1/apps/${appId}/icon`}
            alt=""
            style={dims}
            onError={() => {
                setFailed(true);
            }}
            className={`shrink-0 object-cover border border-nd-border bg-nd-surface-raised ${className}`}
        />
    );
}
