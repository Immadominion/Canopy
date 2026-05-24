import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Crash Detail",
};

interface CrashDetail {
    id: string;
    app_id: string;
    fingerprint: string;
    error_message: string;
    stack_trace: string;
    wallet_hash: string | null;
    app_version: string | null;
    sdk_version: string | null;
    device_model: string | null;
    android_version: string | null;
    occurrence_count: number;
    first_seen_at: string;
    last_seen_at: string;
    resolved_at: string | null;
    created_at: string;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
    });
}

function formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
}

interface PageProps {
    params: Promise<{ appId: string; crashId: string }>;
}

/**
 * /dashboard/apps/[appId]/crashes/[crashId] — crash report detail.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Error message — Doto display in dot-grid hero (ONE pattern break)
 *   Layer 2 (Secondary): Device/version context grid + full stack trace
 *   Layer 3 (Tertiary):  Timeline (first seen, last seen, occurrences)
 *
 * Accent red: used on OPEN status badge — one instance per screen.
 * No accent on resolved badge (uses text-secondary — it's resolved, not urgent).
 */
export default async function CrashDetailPage({ params }: PageProps) {
    const { appId, crashId } = await params;

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

    const { data: crash } = await admin
        .from("crash_reports")
        .select("*")
        .eq("id", crashId)
        .eq("app_id", appId)
        .maybeSingle();

    if (!crash) notFound();

    const c = crash as unknown as CrashDetail;
    const isOpen = !c.resolved_at;

    async function markResolved() {
        "use server";
        const adminClient = createSupabaseAdminClient();
        await adminClient
            .from("crash_reports")
            .update({ resolved_at: new Date().toISOString() })
            .eq("id", crashId)
            .eq("app_id", appId);
        redirect(`/dashboard/apps/${appId}/crashes/${crashId}`);
    }

    async function markReopened() {
        "use server";
        const adminClient = createSupabaseAdminClient();
        await adminClient
            .from("crash_reports")
            .update({ resolved_at: null })
            .eq("id", crashId)
            .eq("app_id", appId);
        redirect(`/dashboard/apps/${appId}/crashes/${crashId}`);
    }

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
                    href={`/dashboard/apps/${app.id}`}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    {app.name}
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <Link
                    href={`/dashboard/apps/${app.id}/crashes`}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    CRASHES
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    {c.fingerprint.slice(0, 8).toUpperCase()}
                </span>
            </div>

            {/* ── Layer 1: Error hero with dot-grid (ONE pattern break) ── */}
            <div className="relative bg-nd-dot-grid bg-nd-dot-16 border border-nd-border p-nd-xl mb-nd-2xl overflow-hidden">
                <div className="flex items-start justify-between gap-nd-lg mb-nd-md">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        CRASH REPORT
                    </p>
                    {isOpen ? (
                        <span className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em] shrink-0">
                            OPEN
                        </span>
                    ) : (
                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] shrink-0">
                            RESOLVED
                        </span>
                    )}
                </div>

                {/* Error message — primary hero content */}
                <p className="font-mono text-nd-heading text-nd-text-display leading-snug mb-nd-xl">
                    {c.error_message}
                </p>

                {/* KPI row */}
                <div className="grid grid-cols-3 gap-nd-xl">
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                            OCCURRENCES
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-display leading-none">
                            {formatCount(c.occurrence_count)}
                        </p>
                    </div>
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                            FIRST SEEN
                        </p>
                        <p className="font-mono text-nd-body-sm text-nd-text-primary leading-snug">
                            {formatDate(c.first_seen_at)}
                        </p>
                    </div>
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                            LAST SEEN
                        </p>
                        <p className="font-mono text-nd-body-sm text-nd-text-primary leading-snug">
                            {formatDate(c.last_seen_at)}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Layer 2a: Device / version context ── */}
            <div className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    DEVICE CONTEXT
                </p>
                <div className="border-t border-nd-border">
                    {[
                        { label: "APP VERSION", value: c.app_version },
                        { label: "SDK VERSION", value: c.sdk_version },
                        { label: "DEVICE MODEL", value: c.device_model },
                        { label: "ANDROID VERSION", value: c.android_version },
                        { label: "FINGERPRINT", value: c.fingerprint },
                        {
                            label: "WALLET",
                            value: c.wallet_hash ? c.wallet_hash.slice(0, 16) + "…" : null,
                        },
                    ]
                        .filter((row) => row.value)
                        .map((row) => (
                            <div
                                key={row.label}
                                className="flex items-center justify-between border-b border-nd-border py-nd-md"
                            >
                                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                                    {row.label}
                                </span>
                                <span className="font-mono text-nd-body-sm text-nd-text-primary">
                                    {row.value}
                                </span>
                            </div>
                        ))}
                </div>
            </div>

            {/* ── Layer 2b: Stack trace ── */}
            <div className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    STACK TRACE
                </p>
                <pre className="font-mono text-nd-caption text-nd-text-secondary bg-nd-surface border border-nd-border p-nd-lg overflow-x-auto whitespace-pre leading-relaxed">
                    {c.stack_trace}
                </pre>
            </div>

            {/* ── Layer 3: Actions ── */}
            <div className="border-t border-nd-border pt-nd-xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    ACTIONS
                </p>
                <div className="flex items-center gap-nd-md">
                    {isOpen ? (
                        <form action={markResolved}>
                            <button
                                type="submit"
                                className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] border border-nd-border-visible rounded-full px-nd-xl py-nd-sm hover:text-nd-text-primary hover:border-nd-text-secondary transition-colors"
                            >
                                MARK RESOLVED
                            </button>
                        </form>
                    ) : (
                        <form action={markReopened}>
                            <button
                                type="submit"
                                className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] border border-nd-border-visible rounded-full px-nd-xl py-nd-sm hover:text-nd-text-primary hover:border-nd-text-secondary transition-colors"
                            >
                                REOPEN
                            </button>
                        </form>
                    )}
                    <Link
                        href={`/dashboard/apps/${app.id}/crashes`}
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                    >
                        BACK TO CRASHES
                    </Link>
                </div>
            </div>
        </div>
    );
}
