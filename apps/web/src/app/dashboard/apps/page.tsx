import Link from "next/link";
import type { Metadata } from "next";

import { CreateAppForm } from "@/components/apps/create-app-form";
import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Apps",
};

/**
 * Helper: relative time display in Space Mono style.
 */
function relativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}M AGO`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}H AGO`;
    const days = Math.floor(hours / 24);
    return `${days}D AGO`;
}

/**
 * /dashboard/apps — app management list.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   "APPS" + count
 *   Layer 2 (Secondary): App rows — name, package
 *   Layer 3 (Tertiary):  Timestamps, metadata, links
 *
 * One accent red: only appears via CreateAppForm error state.
 */
export default async function AppsPage() {
    const publisher = await getCurrentPublisher();

    // ── No publisher row yet ──────────────────────────────────────────────────
    if (!publisher) {
        return (
            <div className="max-w-xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    APPS
                </p>
                <p className="font-body text-nd-body text-nd-text-secondary mb-nd-xl">
                    Your wallet is not registered as a publisher yet. Complete onboarding
                    in the dApp Store Publisher Portal to get started.
                </p>
            </div>
        );
    }

    // ── Fetch apps for this publisher ─────────────────────────────────────────
    const admin = createSupabaseAdminClient();
    const { data: apps } = await admin
        .from("apps")
        .select("id, name, package_name, created_at")
        .eq("publisher_id", publisher.id)
        .order("created_at", { ascending: false });

    const appList = apps ?? [];

    return (
        <div className="max-w-3xl">
            {/* ── Layer 1: Primary header ── */}
            <div className="flex items-baseline justify-between mb-nd-2xl">
                <div>
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                        APPS
                    </p>
                    <p className="font-mono text-nd-display-md text-nd-text-display leading-none tracking-tighter">
                        {appList.length}
                    </p>
                </div>
                <CreateAppForm />
            </div>

            {/* ── Layer 2: App list ── */}
            {appList.length === 0 ? (
                <div className="border-t border-nd-border pt-nd-xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        NO APPS YET
                    </p>
                    <p className="mt-nd-sm font-body text-nd-body-sm text-nd-text-secondary">
                        Create your first app to start distributing beta builds.
                    </p>
                </div>
            ) : (
                <div className="border-t border-nd-border">
                    {/* Column labels */}
                    <div className="grid grid-cols-[1fr_auto_auto] gap-nd-xl py-nd-sm border-b border-nd-border">
                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            NAME / PACKAGE
                        </span>
                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] text-right">
                            CREATED
                        </span>
                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] text-right w-16" />
                    </div>

                    {appList.map((app) => (
                        <div
                            key={app.id}
                            className="grid grid-cols-[1fr_auto_auto] gap-nd-xl py-nd-lg border-b border-nd-border items-center"
                        >
                            {/* Layer 2: name + package */}
                            <div>
                                <p className="font-body text-nd-body text-nd-text-primary leading-snug">
                                    {app.name}
                                </p>
                                <p className="font-mono text-nd-caption text-nd-text-secondary tracking-[0.04em] mt-nd-2xs">
                                    {app.package_name}
                                </p>
                            </div>

                            {/* Layer 3: timestamp */}
                            <span className="font-mono text-nd-caption text-nd-text-disabled tracking-[0.04em]">
                                {relativeTime(app.created_at)}
                            </span>

                            {/* Layer 3: action link */}
                            <Link
                                href={`/dashboard/apps/${app.id}`}
                                className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors text-right"
                            >
                                VIEW →
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
