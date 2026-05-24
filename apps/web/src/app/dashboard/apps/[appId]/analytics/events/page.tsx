import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import EventSelector from "./event-selector";

export const metadata: Metadata = {
    title: "Event Properties Explorer",
};

interface TopEvent {
    event_name: string;
    event_count: number;
    pct: number;
}

interface EventProperty {
    property_key: string;
    occurrence_count: number;
    sample_values: unknown[];
}

interface PageProps {
    params: Promise<{ appId: string }>;
    searchParams: Promise<{ event?: string }>;
}

function formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
}

function renderSampleValue(v: unknown): string {
    if (v === null || v === undefined) return "null";
    if (typeof v === "object") return JSON.stringify(v).slice(0, 40);
    return String(v).slice(0, 40);
}

/**
 * /dashboard/apps/[appId]/analytics/events — event properties explorer.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Selected event name + occurrence hero
 *   Layer 2 (Secondary): Property key frequency table
 *   Layer 3 (Tertiary):  Sample values per property key
 *
 * Accent red: top property key occurrence count — one instance per screen.
 */
export default async function EventPropertiesPage({ params, searchParams }: PageProps) {
    const { appId } = await params;
    const { event: selectedEvent } = await searchParams;

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

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get top events list for the selector (re-use get_top_events RPC)
    const { data: topEventsData } = await admin.rpc("get_top_events", {
        _app_id: appId,
        _since: thirtyDaysAgo,
        _limit: 50,
    });
    const topEvents = (topEventsData ?? []) as TopEvent[];
    const eventNames = topEvents.map((e) => e.event_name);

    // If an event is selected, fetch its property breakdown
    let properties: EventProperty[] = [];
    if (selectedEvent && eventNames.includes(selectedEvent)) {
        const { data: propsData } = await admin.rpc("get_event_properties", {
            _app_id: appId,
            _event_name: selectedEvent,
            _since: thirtyDaysAgo,
            _limit: 10,
        });
        properties = (propsData ?? []) as EventProperty[];
    }

    const selectedEventStats = selectedEvent
        ? topEvents.find((e) => e.event_name === selectedEvent)
        : null;

    const maxOccurrence = Math.max(...properties.map((p) => p.occurrence_count), 1);

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
                    EVENTS
                </span>
            </div>

            {/* ── Layer 1: Hero — selected event or prompt ── */}
            {selectedEvent && selectedEventStats ? (
                <div className="border border-nd-border p-nd-xl mb-nd-2xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xl">
                        SELECTED EVENT — 30 DAYS
                    </p>
                    <div className="grid grid-cols-3 gap-nd-xl">
                        <div className="col-span-2">
                            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                                EVENT
                            </p>
                            <p className="font-mono text-nd-heading text-nd-text-display leading-tight break-all">
                                {selectedEvent}
                            </p>
                        </div>
                        <div>
                            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                                OCCURRENCES
                            </p>
                            <p className="font-mono text-nd-display-md text-nd-text-primary leading-none">
                                {formatCount(selectedEventStats.event_count)}
                            </p>
                            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                                {String(selectedEventStats.pct)}% OF EVENTS
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="border border-nd-border p-nd-xl mb-nd-2xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        EVENT PROPERTIES EXPLORER
                    </p>
                    <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                        Select an event below to inspect its property key frequencies and sample values
                        over the last 30 days.
                    </p>
                </div>
            )}

            {/* ── Layer 2: Properties table ── */}
            {selectedEvent && properties.length > 0 && (
                <div className="mb-nd-2xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                        PROPERTY KEYS
                    </p>

                    <div className="border-t border-nd-border">
                        {properties.map((prop, i) => {
                            const barW = Math.max(2, Math.round((prop.occurrence_count / maxOccurrence) * 100));
                            const isTop = i === 0;

                            return (
                                <div key={prop.property_key} className="border-b border-nd-border py-nd-lg">
                                    <div className="flex items-center justify-between mb-nd-sm">
                                        <p
                                            className={
                                                "font-mono text-nd-body-sm uppercase tracking-[0.08em] " +
                                                (isTop ? "text-nd-accent" : "text-nd-text-primary")
                                            }
                                        >
                                            {prop.property_key}
                                        </p>
                                        <span
                                            className={
                                                "font-mono text-nd-label tabular-nums " +
                                                (isTop ? "text-nd-accent" : "text-nd-text-disabled")
                                            }
                                        >
                                            {formatCount(prop.occurrence_count)}
                                        </span>
                                    </div>

                                    {/* Frequency bar */}
                                    <div className="h-px bg-nd-border-visible mb-nd-md">
                                        <div
                                            className={"h-px " + (isTop ? "bg-nd-accent" : "bg-nd-text-secondary")}
                                            style={{ width: String(barW) + "%" }}
                                        />
                                    </div>

                                    {/* ── Layer 3: Sample values ── */}
                                    {Array.isArray(prop.sample_values) && prop.sample_values.length > 0 && (
                                        <div className="flex flex-wrap gap-nd-sm">
                                            {(prop.sample_values as unknown[]).map((v, vi) => (
                                                <span
                                                    key={vi}
                                                    className="font-mono text-nd-label text-nd-text-disabled border border-nd-border px-nd-sm py-px"
                                                >
                                                    {renderSampleValue(v)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {selectedEvent && properties.length === 0 && (
                <div className="mb-nd-2xl border-t border-nd-border pt-nd-xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        NO PROPERTIES FOUND
                    </p>
                    <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                        This event has no{" "}
                        <code className="font-mono text-nd-text-secondary">properties</code> data in the last
                        30 days, or all properties are empty objects.
                    </p>
                </div>
            )}

            {/* ── Event selector ── */}
            <Suspense fallback={null}>
                <EventSelector
                    eventNames={eventNames}
                    selectedEvent={selectedEvent ?? null}
                    appId={appId}
                />
            </Suspense>
        </div>
    );
}
