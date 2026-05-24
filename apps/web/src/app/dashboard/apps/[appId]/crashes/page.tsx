import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Crashes",
};

interface CrashRow {
    id: string;
    fingerprint: string;
    error_message: string;
    app_version: string | null;
    occurrence_count: number;
    first_seen_at: string;
    last_seen_at: string;
    resolved_at: string | null;
}

interface TrendPoint {
    day: string; // "YYYY-MM-DD"
    count: number;
}

function formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return mins <= 1 ? "just now" : String(mins) + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return String(hrs) + "h ago";
    const days = Math.floor(hrs / 24);
    return String(days) + "d ago";
}

function formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
}

type StatusFilter = "open" | "resolved" | "all";

interface PageProps {
    params: Promise<{ appId: string }>;
    searchParams: Promise<{ status?: string; cursor?: string }>;
}

/**
 * /dashboard/apps/[appId]/crashes — crash reporting dashboard.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Open crash count — dot-grid hero, Doto display (ONE pattern break)
 *   Layer 2 (Secondary): Status filter tabs + crash list table
 *   Layer 3 (Tertiary):  Per-row metadata (app_version, first_seen, occurrences)
 *
 * Accent red: used on "OPEN" status badge — one instance per screen.
 */
export default async function CrashesPage({ params, searchParams }: PageProps) {
    const { appId } = await params;
    const { status: rawStatus, cursor } = await searchParams;

    const status: StatusFilter =
        rawStatus === "resolved" || rawStatus === "all" ? rawStatus : "open";

    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    const { data: app } = await admin
        .from("apps")
        .select("id, name")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!app) notFound();

    // Fetch open count for hero KPI
    const { count: openCount } = await admin
        .from("crash_reports")
        .select("id", { count: "exact", head: true })
        .eq("app_id", appId)
        .is("resolved_at", null);

    // 30-day crash trend — new issues first reported each day
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: trendRaw } = await admin
        .from("crash_reports")
        .select("first_seen_at")
        .eq("app_id", appId)
        .gte("first_seen_at", thirtyDaysAgo)
        .order("first_seen_at", { ascending: true });

    // Group by calendar day (UTC)
    const dayMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
        const d = new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000);
        dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const row of trendRaw ?? []) {
        const day = row.first_seen_at.slice(0, 10);
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    const trendPoints: TrendPoint[] = Array.from(dayMap.entries()).map(([day, count]) => ({
        day,
        count,
    }));
    const trendMax = Math.max(...trendPoints.map((p) => p.count), 1);
    const totalNew30d = trendPoints.reduce((acc, p) => acc + p.count, 0);

    const PAGE_SIZE = 20;

    // Build crash list query
    let query = admin
        .from("crash_reports")
        .select(
            "id, fingerprint, error_message, app_version, occurrence_count, first_seen_at, last_seen_at, resolved_at",
        )
        .eq("app_id", appId)
        .order("last_seen_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

    if (status === "open") {
        query = query.is("resolved_at", null);
    } else if (status === "resolved") {
        query = query.not("resolved_at", "is", null);
    }

    // Cursor pagination
    if (cursor) {
        const { data: cursorRow } = await admin
            .from("crash_reports")
            .select("last_seen_at")
            .eq("id", cursor)
            .eq("app_id", appId)
            .maybeSingle();

        if (cursorRow) {
            query = query.lt("last_seen_at", cursorRow.last_seen_at);
        }
    }

    const { data: crashData } = await query;
    const rows = (crashData ?? []) as CrashRow[];
    const hasMore = rows.length > PAGE_SIZE;
    const crashes = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? (crashes.at(-1)?.id ?? null) : null;

    const baseUrl = `/dashboard/apps/${app.id}/crashes`;

    function statusUrl(s: StatusFilter) {
        return s === "open" ? baseUrl : `${baseUrl}?status=${s}`;
    }

    function nextPageUrl() {
        const params = new URLSearchParams();
        if (status !== "open") params.set("status", status);
        if (nextCursor) params.set("cursor", nextCursor);
        const qs = params.toString();
        return qs ? `${baseUrl}?${qs}` : baseUrl;
    }

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
                <Link
                    href={`/dashboard/apps/${app.id}`}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    {app.name}
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    CRASHES
                </span>
            </div>

            {/* ── Layer 1: dot-grid hero (ONE pattern break) ── */}
            <div className="relative bg-nd-dot-grid bg-nd-dot-16 border border-nd-border p-nd-xl mb-nd-2xl overflow-hidden">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xl">
                    {app.name} — CRASH OVERVIEW
                </p>
                <div className="flex items-end gap-nd-2xl">
                    {/* Open count — accent red interrupt */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em] mb-nd-sm">
                            OPEN
                        </p>
                        <p className="font-display text-nd-display-lg text-nd-accent leading-none">
                            {formatCount(openCount ?? 0)}
                        </p>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                            UNRESOLVED ISSUES
                        </p>
                    </div>
                    {/* New issues this month — secondary KPI */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            NEW / 30 DAYS
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-primary leading-none">
                            {formatCount(totalNew30d)}
                        </p>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                            DISTINCT ISSUES
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Layer 2: Status filter + crash table ── */}

            {/* Segmented filter */}
            <div
                className="flex items-center border border-nd-border-visible rounded-full w-fit mb-nd-xl"
                role="tablist"
                aria-label="Crash status filter"
            >
                {(["open", "resolved", "all"] as StatusFilter[]).map((s) => (
                    <Link
                        key={s}
                        href={statusUrl(s)}
                        role="tab"
                        aria-selected={status === s}
                        className={[
                            "font-mono text-nd-label uppercase tracking-[0.08em] px-nd-lg py-nd-sm rounded-full transition-colors",
                            status === s
                                ? "bg-nd-text-display text-nd-black"
                                : "text-nd-text-secondary hover:text-nd-text-primary",
                        ].join(" ")}
                    >
                        {s === "open" ? "OPEN" : s === "resolved" ? "RESOLVED" : "ALL"}
                    </Link>
                ))}
            </div>

            {/* Crash list */}
            {crashes.length === 0 ? (
                <div className="border-t border-nd-border pt-nd-xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        {status === "open"
                            ? "NO OPEN ISSUES"
                            : status === "resolved"
                                ? "NO RESOLVED ISSUES"
                                : "NO CRASH REPORTS YET"}
                    </p>
                    {status === "open" && (
                        <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                            No open crash reports. Install the{" "}
                            <code className="font-mono text-nd-text-secondary">@canopy/react-native</code> SDK
                            to start capturing crash events from your app.
                        </p>
                    )}
                </div>
            ) : (
                <div className="border-t border-nd-border">
                    {crashes.map((crash) => (
                        <Link
                            key={crash.id}
                            href={`/dashboard/apps/${app.id}/crashes/${crash.id}`}
                            className="group block border-b border-nd-border py-nd-lg hover:bg-nd-surface transition-colors px-nd-sm"
                        >
                            {/* Row: error message + status badge */}
                            <div className="flex items-start justify-between gap-nd-md mb-nd-sm">
                                <p className="font-mono text-nd-body-sm text-nd-text-primary line-clamp-2 flex-1 group-hover:text-nd-text-display transition-colors">
                                    {crash.error_message}
                                </p>
                                {crash.resolved_at ? (
                                    <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] shrink-0">
                                        RESOLVED
                                    </span>
                                ) : (
                                    <span className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em] shrink-0">
                                        OPEN
                                    </span>
                                )}
                            </div>

                            {/* Row: Layer 3 metadata */}
                            <div className="flex items-center gap-nd-xl flex-wrap">
                                {crash.app_version && (
                                    <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                        V{crash.app_version}
                                    </span>
                                )}
                                <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                    {formatCount(crash.occurrence_count)} OCCURRENCES
                                </span>
                                <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                    LAST SEEN {formatRelative(crash.last_seen_at).toUpperCase()}
                                </span>
                                <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                    FIRST SEEN {formatRelative(crash.first_seen_at).toUpperCase()}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {/* ── Layer 3: Pagination ── */}
            {hasMore && (
                <div className="flex justify-center mt-nd-xl">
                    <Link
                        href={nextPageUrl()}
                        className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] border border-nd-border-visible rounded-full px-nd-lg py-nd-sm hover:text-nd-text-primary hover:border-nd-text-secondary transition-colors"
                    >
                        LOAD MORE
                    </Link>
                </div>
            )}

            {/* ── Crash trend sparkline ── */}
            <div className="mt-nd-2xl">
                <div className="flex items-center justify-between mb-nd-md">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        NEW ISSUES — 30 DAYS
                    </p>
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        PEAK&nbsp;&nbsp;{formatCount(trendMax)}
                    </p>
                </div>

                {totalNew30d === 0 ? (
                    <div className="border-t border-nd-border pt-nd-xl">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            NO CRASH ACTIVITY IN 30 DAYS
                        </p>
                    </div>
                ) : (
                    <div className="border-t border-nd-border pt-nd-md">
                        {/* Bar chart — proportional height per day */}
                        <div
                            className="flex items-end gap-px h-16"
                            role="img"
                            aria-label="30-day new crash issues trend"
                        >
                            {trendPoints.map((p) => {
                                const h = Math.max(1, Math.round((p.count / trendMax) * 64));
                                return (
                                    <div
                                        key={p.day}
                                        className="flex-1 bg-nd-border-visible hover:bg-nd-accent transition-colors cursor-default"
                                        style={{ height: String(h) + "px" }}
                                        title={p.day + " — " + String(p.count) + " new issue" + (p.count === 1 ? "" : "s")}
                                    />
                                );
                            })}
                        </div>
                        {/* Date range labels */}
                        <div className="flex justify-between mt-nd-sm">
                            <p className="font-mono text-nd-label text-nd-text-disabled tracking-[0.04em]">
                                {trendPoints.at(0)?.day ?? ""}
                            </p>
                            <p className="font-mono text-nd-label text-nd-text-disabled tracking-[0.04em]">
                                {trendPoints.at(-1)?.day ?? ""}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
