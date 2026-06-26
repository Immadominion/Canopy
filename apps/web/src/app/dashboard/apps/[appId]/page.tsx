import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { trackStatusChip } from "@/lib/ui/track-status";
import { CaretRight, GearSix, UploadSimple, Users, Clock, Package, ChatText } from "@/components/ui/icon";

export const metadata: Metadata = {
    title: "App Detail",
};

function monogram(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0] ?? "";
    if (parts.length === 0) return "?";
    if (parts.length === 1) return first.slice(0, 2).toUpperCase();
    return ((first[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function expiryDisplay(expiresAt: string): string {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "expired";
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    if (days > 0) return `${days}d ${hours}h left`;
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    return `${hours}h ${mins}m left`;
}

interface PageProps {
    params: Promise<{ appId: string }>;
}

/**
 * /dashboard/apps/[appId] — app detail with beta track (build) list.
 */
export default async function AppDetailPage({ params }: PageProps) {
    const { appId } = await params;
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    const { data: app, error: appError } = await admin
        .from("apps")
        .select("id, name, package_name, created_at, description")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (appError || !app) notFound();

    const { data: tracks } = await admin
        .from("beta_tracks")
        .select(
            "id, version_name, version_code, status, tester_count, tester_cap, expires_at, arweave_tx_id, created_at",
        )
        .eq("app_id", app.id)
        .order("created_at", { ascending: false });

    const trackList = tracks ?? [];

    return (
        <div>
            {/* ── Breadcrumb ── */}
            <nav className="flex items-center gap-nd-xs mb-nd-lg text-nd-body-sm" aria-label="Breadcrumb">
                <Link href="/dashboard/apps" className="text-nd-text-secondary hover:text-nd-text-primary transition-colors">
                    Apps
                </Link>
                <CaretRight size={14} className="text-nd-text-disabled" />
                <span className="text-nd-text-primary">{app.name}</span>
            </nav>

            {/* ── Header ── */}
            <div className="flex items-start justify-between gap-nd-lg mb-nd-2xl">
                <div className="flex items-center gap-nd-md min-w-0">
                    <span className="flex items-center justify-center w-12 h-12 shrink-0 rounded-nd-card bg-nd-surface-raised border border-nd-border font-mono text-nd-body font-semibold text-nd-text-primary">
                        {monogram(app.name)}
                    </span>
                    <div className="min-w-0">
                        <h1 className="font-body text-nd-heading font-bold text-nd-text-display tracking-tight truncate">
                            {app.name}
                        </h1>
                        <p className="font-mono text-nd-caption text-nd-text-secondary truncate mt-0.5">
                            {app.package_name}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-nd-sm shrink-0">
                    <Link href={`/dashboard/apps/${app.id}/feedback`} className="btn-secondary">
                        <ChatText size={16} /> <span className="hidden sm:inline">Feedback</span>
                    </Link>
                    <Link href={`/dashboard/apps/${app.id}/settings`} className="btn-secondary">
                        <GearSix size={16} /> <span className="hidden sm:inline">Settings</span>
                    </Link>
                    <Link href={`/dashboard/apps/${app.id}/upload`} className="btn-primary">
                        <UploadSimple size={16} weight="bold" /> Upload build
                    </Link>
                </div>
            </div>

            {app.description && (
                <p className="text-nd-body-sm text-nd-text-secondary max-w-2xl mb-nd-2xl -mt-nd-md">
                    {app.description}
                </p>
            )}

            {/* ── Builds ── */}
            <h2 className="text-nd-body font-semibold text-nd-text-primary mb-nd-md">
                Builds <span className="text-nd-text-disabled font-normal">· {trackList.length}</span>
            </h2>

            {trackList.length === 0 ? (
                <div className="card flex flex-col items-center text-center px-nd-lg py-nd-2xl">
                    <span className="flex items-center justify-center w-12 h-12 rounded-nd-card bg-nd-brand-subtle text-nd-brand-hover mb-nd-md">
                        <Package size={24} weight="fill" />
                    </span>
                    <p className="text-nd-body font-medium text-nd-text-primary">No builds yet</p>
                    <p className="mt-nd-2xs text-nd-body-sm text-nd-text-secondary">
                        Upload an APK to create your first beta track.
                    </p>
                </div>
            ) : (
                <div className="space-y-nd-sm">
                    {trackList.map((track) => {
                        const { label, cls } = trackStatusChip(track.status);
                        const ended = track.status === "expired" || track.status === "revoked";
                        return (
                            <Link
                                key={track.id}
                                href={`/dashboard/apps/${app.id}/tracks/${track.id}`}
                                className="card card-interactive group flex items-center gap-nd-md p-nd-md"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-nd-body font-semibold text-nd-text-display">
                                        {track.version_name}{" "}
                                        <span className="font-mono text-nd-caption font-normal text-nd-text-disabled">
                                            ({track.version_code})
                                        </span>
                                    </p>
                                    <div className="flex items-center gap-nd-md mt-nd-xs text-nd-caption text-nd-text-secondary">
                                        <span className="inline-flex items-center gap-1">
                                            <Users size={13} /> {track.tester_count}/{track.tester_cap}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock size={13} /> {ended ? "—" : expiryDisplay(track.expires_at)}
                                        </span>
                                    </div>
                                </div>
                                <span className={`chip ${cls}`}>{label}</span>
                                <CaretRight
                                    size={16}
                                    className="text-nd-text-disabled group-hover:text-nd-brand-hover transition-colors shrink-0"
                                />
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
