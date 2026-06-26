import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AddTestersForm } from "@/components/beta/add-testers-form";
import { AddFromGroupForm } from "@/components/beta/add-from-group-form";
import { ShareInstallLink } from "@/components/beta/share-install-link";
import { TrackStatusControls } from "@/components/beta/track-status-controls";
import { TrackDangerControls } from "@/components/beta/track-danger-controls";
import { TrackExpiryCountdown } from "@/components/beta/track-expiry-countdown";
import { TrackStatusPoller } from "@/components/beta/track-status-poller";

export const metadata: Metadata = {
    title: "Track Detail",
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
        case "scan_passed":
            return { label: "SCAN PASSED", className: "text-nd-text-secondary" };
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

// Roster: rank install_events so each tester resolves to the furthest stage reached.
const ACTION_RANK: Record<string, number> = {
    url_generated: 1,
    download_started: 2,
    install_confirmed: 3,
};

/** Per-tester lifecycle label derived from the highest install_event reached. */
function rosterStatus(rank: number): { label: string; className: string } {
    if (rank >= 3) return { label: "INSTALLED", className: "text-nd-text-display" };
    if (rank >= 2) return { label: "DOWNLOADED", className: "text-nd-text-secondary" };
    return { label: "INVITED", className: "text-nd-text-disabled" };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

interface PageProps {
    params: Promise<{ appId: string; trackId: string }>;
}

/**
 * /dashboard/apps/[appId]/tracks/[trackId] — beta track detail.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Version name + status + expiry countdown
 *   Layer 2 (Secondary): Tester list + add-testers form
 *   Layer 3 (Tertiary):  APK metadata, hashes, track controls
 *
 * One accent red: only for scan_failed / revoked status.
 */
export default async function TrackDetailPage({ params }: PageProps) {
    const { appId, trackId } = await params;
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    // Fetch app — must belong to this publisher
    const { data: app, error: appError } = await admin
        .from("apps")
        .select("id, name, package_name")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (appError || !app) notFound();

    // Fetch track — must belong to this app
    const { data: track, error: trackError } = await admin
        .from("beta_tracks")
        .select(
            "id, version_name, version_code, status, tester_count, tester_cap, apk_sha256, apk_size_bytes, release_notes, arweave_tx_id, apk_deleted_at, expires_at, created_at",
        )
        .eq("id", trackId)
        .eq("app_id", app.id)
        .maybeSingle();

    if (trackError || !track) notFound();

    // Fetch tester list
    const { data: testers } = await admin
        .from("beta_testers")
        .select("id, wallet_hash, created_at")
        .eq("track_id", track.id)
        .order("created_at", { ascending: false });

    const testerList = testers ?? [];
    const isExpired = new Date(track.expires_at).getTime() < Date.now();
    const { label: statusLabel, className: statusClassName } = trackStatusStyle(track.status);

    // Reusable tester groups for the "Add from group" picker, and the groups
    // already applied to this track (provenance).
    const { data: pubGroups } = await admin
        .from("tester_groups")
        .select("id, name, member_count")
        .eq("publisher_id", publisher.id)
        .order("updated_at", { ascending: false });
    const { data: trackGroupLinks } = await admin
        .from("beta_track_group_links")
        .select("group_id, members_added, partial")
        .eq("track_id", track.id);

    const groupOptions = (pubGroups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.member_count,
    }));
    const groupNameById = new Map(groupOptions.map((g) => [g.id, g.name]));
    const attachedGroups = (trackGroupLinks ?? []).map((l) => ({
        groupId: l.group_id,
        name: groupNameById.get(l.group_id) ?? "Unknown group",
        membersAdded: l.members_added,
        partial: l.partial,
    }));
    const canAddTesters =
        track.status === "active" && !isExpired && track.tester_count < track.tester_cap;

    // Per-tester roster: derive Invited → Downloaded → Installed + last-seen from
    // install_events (no extra schema — the action enum already carries all three).
    const { data: installEvents } = await admin
        .from("install_events")
        .select("wallet_hash, action, created_at")
        .eq("track_id", track.id);

    const activityByWallet = new Map<string, { rank: number; lastSeen: string }>();
    for (const e of installEvents ?? []) {
        const prev = activityByWallet.get(e.wallet_hash);
        const r = ACTION_RANK[e.action] ?? 0;
        activityByWallet.set(e.wallet_hash, {
            rank: Math.max(prev?.rank ?? 0, r),
            lastSeen: !prev || e.created_at > prev.lastSeen ? e.created_at : prev.lastSeen,
        });
    }
    const roster = testerList.map((t) => {
        const activity = activityByWallet.get(t.wallet_hash);
        return { ...t, rank: activity?.rank ?? 0, lastSeen: activity?.lastSeen ?? null };
    });
    const installedCount = roster.filter((r) => r.rank >= 3).length;
    const downloadedCount = roster.filter((r) => r.rank === 2).length;

    return (
        <div className="max-w-3xl mx-auto">
            {/* Auto-refresh while the build is scanning so the status updates live. */}
            <TrackStatusPoller trackId={track.id} status={track.status} />
            {/* ── Breadcrumb ── */}
            <div className="flex items-center gap-nd-sm mb-nd-xl flex-wrap">
                <Link
                    href="/dashboard/apps"
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    APPS
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <Link
                    href={`/dashboard/apps/${app.id}`}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    {app.name}
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    {track.version_name}
                </span>
            </div>

            {/* ── Layer 1: Primary — version + status + expiry ── */}
            <div className="mb-nd-2xl">
                <div className="flex items-start justify-between gap-nd-xl">
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                            {app.package_name}
                        </p>
                        <p className="font-body text-nd-display-md text-nd-text-display leading-tight">
                            {track.version_name}
                        </p>
                        <p className="font-mono text-nd-caption text-nd-text-secondary mt-nd-xs">
                            BUILD {track.version_code}
                        </p>
                    </div>

                    <div className="text-right">
                        <p className={`font-mono text-nd-label uppercase tracking-[0.08em] ${statusClassName}`}>
                            {statusLabel}
                        </p>
                        {track.apk_deleted_at && (
                            <p className="font-mono text-nd-caption text-nd-text-disabled uppercase tracking-[0.06em] mt-nd-2xs">
                                BINARY PURGED
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Expiry countdown — live client component ── */}
                <div className="mt-nd-xl">
                    <TrackExpiryCountdown
                        expiresAt={track.expires_at}
                        totalDurationMs={
                            new Date(track.expires_at).getTime() - new Date(track.created_at).getTime()
                        }
                    />
                </div>

                {/* ── Track controls (activate / revoke) ── */}
                {!isExpired && (
                    <div className="mt-nd-xl">
                        <TrackStatusControls trackId={track.id} currentStatus={track.status} />
                    </div>
                )}
            </div>

            {/* ── Layer 2: Tester management ── */}
            <div className="border-t border-nd-border pt-nd-xl mb-nd-2xl">
                <AddTestersForm
                    trackId={track.id}
                    testerCount={track.tester_count}
                    testerCap={track.tester_cap}
                    trackStatus={track.status}
                    trackExpired={isExpired}
                />

                {/* Reuse an existing tester group (TestFlight-style). */}
                <AddFromGroupForm
                    trackId={track.id}
                    groups={groupOptions}
                    attached={attachedGroups}
                    canAdd={canAddTesters}
                />

                {/* Roster — invited → downloaded → installed, derived from install_events */}
                {roster.length > 0 && (
                    <div className="mt-nd-xl border-t border-nd-border">
                        {/* Funnel summary */}
                        <div className="flex flex-wrap gap-nd-xl py-nd-md border-b border-nd-border">
                            <span className="font-mono text-nd-caption text-nd-text-secondary">
                                {roster.length} {roster.length === 1 ? "TESTER" : "TESTERS"}
                            </span>
                            <span className="font-mono text-nd-caption text-nd-text-display">
                                {installedCount} INSTALLED
                            </span>
                            <span className="font-mono text-nd-caption text-nd-text-disabled">
                                {downloadedCount} DOWNLOADING
                            </span>
                        </div>
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_auto_auto] gap-nd-lg py-nd-sm border-b border-nd-border">
                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                WALLET HASH
                            </span>
                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] text-right">
                                STATUS
                            </span>
                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] text-right">
                                LAST SEEN
                            </span>
                        </div>
                        {roster.map((tester) => {
                            const rs = rosterStatus(tester.rank);
                            return (
                                <div
                                    key={tester.id}
                                    className="grid grid-cols-[1fr_auto_auto] gap-nd-lg py-nd-md border-b border-nd-border items-center"
                                >
                                    <p className="font-mono text-nd-caption text-nd-text-secondary tracking-[0.04em] truncate">
                                        {tester.wallet_hash.slice(0, 12)}…{tester.wallet_hash.slice(-8)}
                                    </p>
                                    <p
                                        className={`font-mono text-nd-label uppercase tracking-[0.08em] text-right ${rs.className}`}
                                    >
                                        {rs.label}
                                    </p>
                                    <p className="font-mono text-nd-caption text-nd-text-disabled tracking-[0.04em] text-right">
                                        {new Date(tester.lastSeen ?? tester.created_at)
                                            .toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                            .toUpperCase()}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Share an install link with allowlisted testers (active builds only) */}
                {track.status === "active" && !isExpired && (
                    <div className="mt-nd-xl pt-nd-xl border-t border-nd-border">
                        <ShareInstallLink trackId={track.id} />
                    </div>
                )}
            </div>

            {/* ── Layer 3: APK metadata + Arweave record ── */}
            <div className="border-t border-nd-border pt-nd-xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    BUILD METADATA
                </p>

                <div className="grid grid-cols-1 gap-nd-lg">
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-2xs">
                            APK SHA-256
                        </p>
                        <p className="font-mono text-nd-caption text-nd-text-secondary break-all">
                            {track.apk_sha256}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-nd-lg">
                        <div>
                            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-2xs">
                                SIZE
                            </p>
                            <p className="font-mono text-nd-caption text-nd-text-secondary">
                                {formatBytes(track.apk_size_bytes)}
                            </p>
                        </div>

                        <div>
                            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-2xs">
                                EXPIRES
                            </p>
                            <p className="font-mono text-nd-caption text-nd-text-secondary">
                                {new Date(track.expires_at).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                })}
                            </p>
                        </div>
                    </div>

                    {track.release_notes && (
                        <div>
                            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-2xs">
                                RELEASE NOTES
                            </p>
                            <p className="font-body text-nd-body-sm text-nd-text-secondary whitespace-pre-wrap">
                                {track.release_notes}
                            </p>
                        </div>
                    )}

                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-2xs">
                            ARWEAVE RECORD
                        </p>
                        {track.arweave_tx_id ? (
                            <a
                                href={`https://gateway.irys.xyz/${track.arweave_tx_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-nd-caption text-nd-text-secondary hover:text-nd-text-primary transition-colors break-all"
                            >
                                {track.arweave_tx_id}
                            </a>
                        ) : (
                            <p className="font-mono text-nd-caption text-nd-text-disabled">
                                [ PENDING ]
                            </p>
                        )}
                    </div>

                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-2xs">
                            TRACK ID
                        </p>
                        <p className="font-mono text-nd-caption text-nd-text-disabled">
                            {track.id}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Danger zone — quiet, at the very bottom (deleting is deliberate) ── */}
            <div className="mt-nd-2xl pt-nd-lg border-t border-nd-border">
                <p className="text-nd-caption text-nd-text-disabled mb-nd-sm max-w-md">
                    Deleting a build purges its APK and removes tester access. The immutable Arweave
                    fingerprint record remains. This can&apos;t be undone.
                </p>
                <TrackDangerControls appId={app.id} trackId={track.id} />
            </div>
        </div>
    );
}
