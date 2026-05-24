import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "App Detail",
};

type StatusStyle = {
    label: string;
    className: string;
};

function trackStatusStyle(status: string): StatusStyle {
    switch (status) {
        case "active":
            return { label: "ACTIVE", className: "text-nd-text-display" };
        case "pending_scan":
            return { label: "PENDING SCAN", className: "text-nd-text-secondary" };
        case "scan_in_progress":
            return { label: "SCANNING", className: "text-nd-text-secondary" };
        case "scan_failed":
            return { label: "SCAN FAILED", className: "text-nd-accent" };
        case "revoked":
            return { label: "REVOKED", className: "text-nd-accent" };
        case "expired":
            return { label: "EXPIRED", className: "text-nd-text-disabled" };
        default:
            return { label: status.toUpperCase(), className: "text-nd-text-disabled" };
    }
}

function expiryDisplay(expiresAt: string): string {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "EXPIRED";
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    if (days > 0) return `${days}D ${hours}H`;
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    return `${hours}H ${mins}M`;
}

function relativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}M AGO`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}H AGO`;
    const days = Math.floor(hours / 24);
    return `${days}D AGO`;
}

interface PageProps {
    params: Promise<{ appId: string }>;
}

/**
 * /dashboard/apps/[appId] — app detail with beta track list.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   App name + track count
 *   Layer 2 (Secondary): Track rows — version, status, tester count
 *   Layer 3 (Tertiary):  Expiry, timestamps, action links
 *
 * One accent red: scan_failed / revoked status only.
 */
export default async function AppDetailPage({ params }: PageProps) {
    const { appId } = await params;
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    // Fetch app — must belong to this publisher
    const { data: app, error: appError } = await admin
        .from("apps")
        .select("id, name, package_name, created_at, description")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (appError || !app) notFound();

    // Fetch beta tracks for this app, newest first
    const { data: tracks } = await admin
        .from("beta_tracks")
        .select(
            "id, version_name, version_code, status, tester_count, tester_cap, expires_at, arweave_tx_id, created_at",
        )
        .eq("app_id", app.id)
        .order("created_at", { ascending: false });

    const trackList = tracks ?? [];

    return (
        <div className="max-w-3xl">
            {/* ── Breadcrumb ── */}
            <div className="flex items-center gap-nd-sm mb-nd-xl">
                <Link
                    href="/dashboard/apps"
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    APPS
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    {app.name}
                </span>
            </div>

            {/* ── Layer 1: App identity ── */}
            <div className="flex items-start justify-between mb-nd-2xl">
                <div>
                    <p className="font-body text-nd-display-md text-nd-text-display leading-tight">
                        {app.name}
                    </p>
                    <p className="font-mono text-nd-caption text-nd-text-secondary tracking-[0.04em] mt-nd-xs">
                        {app.package_name}
                    </p>
                    {app.description && (
                        <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm max-w-md">
                            {app.description}
                        </p>
                    )}
                </div>

                <Link
                    href={`/dashboard/apps/${app.id}/upload`}
                    className="font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-lg py-nd-sm hover:border-nd-border-visible transition-colors whitespace-nowrap"
                >
                    + UPLOAD BUILD
                </Link>
            </div>

            {/* ── Layer 2: Track list ── */}
            <div className="mb-nd-sm">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                    BETA TRACKS — {trackList.length}
                </p>
            </div>

            {trackList.length === 0 ? (
                <div className="border-t border-nd-border pt-nd-xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        NO BUILDS YET
                    </p>
                    <p className="mt-nd-sm font-body text-nd-body-sm text-nd-text-secondary">
                        Upload an APK to create your first beta track.
                    </p>
                </div>
            ) : (
                <div className="border-t border-nd-border">
                    {/* Column labels */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-nd-xl py-nd-sm border-b border-nd-border">
                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            VERSION
                        </span>
                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] text-right">
                            TESTERS
                        </span>
                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] text-right">
                            EXPIRES
                        </span>
                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] text-right w-16" />
                    </div>

                    {trackList.map((track) => {
                        const { label, className } = trackStatusStyle(track.status);
                        return (
                            <div
                                key={track.id}
                                className="grid grid-cols-[1fr_auto_auto_auto] gap-nd-xl py-nd-lg border-b border-nd-border items-center"
                            >
                                {/* Layer 2: version + status */}
                                <div>
                                    <p className="font-body text-nd-body text-nd-text-primary leading-snug">
                                        {track.version_name}{" "}
                                        <span className="font-mono text-nd-caption text-nd-text-secondary">
                                            ({track.version_code})
                                        </span>
                                    </p>
                                    <p className={`font-mono text-nd-caption uppercase tracking-[0.04em] mt-nd-2xs ${className}`}>
                                        {label}
                                    </p>
                                </div>

                                {/* Layer 3: tester count */}
                                <span className="font-mono text-nd-caption text-nd-text-secondary tracking-[0.04em]">
                                    {track.tester_count} / {track.tester_cap}
                                </span>

                                {/* Layer 3: expiry */}
                                <span className="font-mono text-nd-caption text-nd-text-disabled tracking-[0.04em]">
                                    {track.status === "expired" || track.status === "revoked"
                                        ? "—"
                                        : expiryDisplay(track.expires_at)}
                                </span>

                                {/* Layer 3: action */}
                                <Link
                                    href={`/dashboard/apps/${app.id}/tracks/${track.id}`}
                                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors text-right"
                                >
                                    VIEW →
                                </Link>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Layer 3: App metadata ── */}
            <div className="mt-nd-2xl pt-nd-xl border-t border-nd-border">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                    APP METADATA
                </p>
                <div className="grid grid-cols-2 gap-nd-lg">
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-2xs">
                            APP ID
                        </p>
                        <p className="font-mono text-nd-caption text-nd-text-secondary">
                            {app.id}
                        </p>
                    </div>
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-2xs">
                            REGISTERED
                        </p>
                        <p className="font-mono text-nd-caption text-nd-text-secondary">
                            {relativeTime(app.created_at)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
