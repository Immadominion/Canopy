import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Session Details",
};

interface AnalyticsEvent {
    id: string;
    name: string;
    timestamp: string;
    wallet_hash: string;
    properties: Record<string, unknown> | null;
    platform: string | null;
    app_version: string | null;
    sdk_version: string | null;
    is_seeker: boolean;
    has_genesis_token: boolean;
}

interface PageProps {
    params: Promise<{ appId: string; sessionId: string }>;
    searchParams: Promise<{ since?: string }>;
}

function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

/**
 * /dashboard/apps/[appId]/analytics/sessions/[sessionId] — session event timeline.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Session ID + wallet hash + event count hero
 *   Layer 2 (Secondary): Chronological event list with names
 *   Layer 3 (Tertiary):  Per-event properties, platform, app version
 *
 * Accent red: none on this screen — secondary-only data view.
 */
export default async function SessionDetailsPage({ params, searchParams }: PageProps) {
    const { appId, sessionId } = await params;
    const { since: sinceParam } = await searchParams;

    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    // Verify app ownership
    const { data: app } = await admin
        .from("apps")
        .select("id, name, package_name")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!app) notFound();

    // 90-day lookback — sessions never span more than 90 days.
    // The caller can pass ?since= to narrow the window for performance.
    const since = sinceParam
        ? new Date(sinceParam).toISOString()
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // analytics_events is a TimescaleDB hypertable — MUST include timestamp filter.
    const { data: events } = await admin
        .from("analytics_events")
        .select(
            "id, name, timestamp, wallet_hash, properties, platform, app_version, sdk_version, is_seeker, has_genesis_token"
        )
        .eq("app_id", appId)
        .eq("session_id", sessionId)
        .gte("timestamp", since)
        .order("timestamp", { ascending: true })
        .limit(500);

    if (!events || events.length === 0) notFound();

    const eventList = events as AnalyticsEvent[];
    const firstEvent = eventList[0];
    const lastEvent = eventList[eventList.length - 1];
    if (!firstEvent || !lastEvent) notFound();
    const sessionDate = formatDate(firstEvent.timestamp);

    // Session duration in seconds
    const durationMs =
        new Date(lastEvent.timestamp).getTime() - new Date(firstEvent.timestamp).getTime();
    const durationSec = Math.round(durationMs / 1000);
    const durationLabel =
        durationSec < 60
            ? String(durationSec) + "s"
            : String(Math.floor(durationSec / 60)) + "m " + String(durationSec % 60) + "s";

    // Truncate session ID for display
    const sessionIdShort = sessionId.length > 20 ? sessionId.slice(0, 20) + "…" : sessionId;
    const walletHashShort =
        firstEvent.wallet_hash.length > 16
            ? firstEvent.wallet_hash.slice(0, 8) + "…" + firstEvent.wallet_hash.slice(-8)
            : firstEvent.wallet_hash;

    return (
        <div className="max-w-3xl">
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
                    href={"/dashboard/apps/" + app.id}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    {app.name}
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <Link
                    href={"/dashboard/apps/" + app.id + "/analytics"}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    ANALYTICS
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    SESSION
                </span>
            </div>

            {/* ── Layer 1: Session hero ── */}
            <div className="border border-nd-border p-nd-xl mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xl">
                    SESSION — {sessionDate}
                </p>

                <div className="grid grid-cols-2 gap-nd-xl sm:grid-cols-4">
                    {/* Event count */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            EVENTS
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-display leading-none">
                            {String(eventList.length)}
                        </p>
                    </div>

                    {/* Duration */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            DURATION
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-primary leading-none">
                            {durationLabel}
                        </p>
                    </div>

                    {/* Platform */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            PLATFORM
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-primary leading-none">
                            {(firstEvent.platform ?? "—").toUpperCase()}
                        </p>
                    </div>

                    {/* Seeker */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            SEEKER
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-primary leading-none">
                            {firstEvent.is_seeker ? "YES" : "NO"}
                        </p>
                    </div>
                </div>

                {/* Session ID + wallet hash */}
                <div className="mt-nd-xl pt-nd-lg border-t border-nd-border grid grid-cols-1 gap-nd-sm sm:grid-cols-2">
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            SESSION ID
                        </p>
                        <p
                            className="font-mono text-nd-label text-nd-text-secondary mt-nd-xs break-all"
                            title={sessionId}
                        >
                            {sessionIdShort}
                        </p>
                    </div>
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            WALLET HASH
                        </p>
                        <p
                            className="font-mono text-nd-label text-nd-text-secondary mt-nd-xs"
                            title={firstEvent.wallet_hash}
                        >
                            {walletHashShort}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Layer 2: Event timeline ── */}
            <div>
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    EVENT TIMELINE
                </p>

                <div className="border-t border-nd-border">
                    {eventList.map((ev, i) => {
                        const hasProps = ev.properties && Object.keys(ev.properties).length > 0;

                        return (
                            <div
                                key={ev.id}
                                className="border-b border-nd-border py-nd-lg flex gap-nd-lg"
                            >
                                {/* Index + time axis */}
                                <div className="shrink-0 w-16">
                                    <p className="font-mono text-nd-label text-nd-text-disabled tabular-nums">
                                        {String(i + 1).padStart(3, "0")}
                                    </p>
                                    <p className="font-mono text-nd-label text-nd-text-disabled tabular-nums mt-nd-xs">
                                        {formatTimestamp(ev.timestamp)}
                                    </p>
                                </div>

                                {/* Event name + properties */}
                                <div className="flex-1 min-w-0">
                                    {/* ── Layer 2: Event name ── */}
                                    <p className="font-mono text-nd-body-sm text-nd-text-primary">
                                        {ev.name}
                                    </p>

                                    {/* ── Layer 3: Properties preview ── */}
                                    {hasProps && (
                                        <div className="mt-nd-sm flex flex-wrap gap-nd-sm">
                                            {Object.entries(ev.properties ?? {})
                                                .slice(0, 4)
                                                .map(([k, v]) => (
                                                    <span
                                                        key={k}
                                                        className="font-mono text-nd-label text-nd-text-disabled border border-nd-border px-nd-sm py-px"
                                                    >
                                                        {k}
                                                        {": "}
                                                        <span className="text-nd-text-secondary">
                                                            {typeof v === "object" ? "[object]" : String(v).slice(0, 24)}
                                                        </span>
                                                    </span>
                                                ))}
                                            {Object.keys(ev.properties ?? {}).length > 4 && (
                                                <span className="font-mono text-nd-label text-nd-text-disabled">
                                                    +{String(Object.keys(ev.properties ?? {}).length - 4)} more
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* App version */}
                                    {ev.app_version && (
                                        <p className="font-mono text-nd-label text-nd-text-disabled mt-nd-xs">
                                            v{ev.app_version}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
