import Link from "next/link";
import type { Metadata } from "next";

import { CreateAppForm } from "@/components/apps/create-app-form";
import { RequestAccessPanel } from "@/components/access/request-access-panel";
import { getCurrentPublisher } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CaretRight, Package } from "@/components/ui/icon";

export const metadata: Metadata = {
    title: "Apps",
};

/** Compact relative time, e.g. "3m ago", "2h ago", "5d ago". */
function relativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

/** Two-letter monogram for an app avatar. */
function monogram(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0] ?? "";
    if (parts.length === 0) return "?";
    if (parts.length === 1) return first.slice(0, 2).toUpperCase();
    return ((first[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
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
    const admin = createSupabaseAdminClient();

    // ── Not yet approved ──────────────────────────────────────────────────────
    // No publisher row, or a row that hasn't been approved: show the access
    // request flow (manual approval over Telegram — see lib/verification/access).
    const status = publisher?.verification_status ?? "unverified";
    if (!publisher || status !== "approved") {
        // Surface the latest pending request so the panel can show the code +
        // prefilled Telegram link directly.
        let pending: { code: string; displayName: string; projectSummary: string } | null = null;
        if (publisher) {
            const { data: req } = await admin
                .from("access_requests")
                .select("code, display_name, project_summary")
                .eq("publisher_id", publisher.id)
                .eq("status", "pending")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (req) {
                pending = {
                    code: req.code,
                    displayName: req.display_name,
                    projectSummary: req.project_summary,
                };
            }
        }

        const panelStatus = status === "pending" ? "pending" : status === "rejected" ? "rejected" : "unverified";

        return (
            <RequestAccessPanel
                initialStatus={panelStatus}
                founderTelegram={env.NEXT_PUBLIC_FOUNDER_TELEGRAM}
                pending={pending}
            />
        );
    }

    // ── Fetch apps for this approved publisher ────────────────────────────────
    const { data: apps } = await admin
        .from("apps")
        .select("id, name, package_name, created_at")
        .eq("publisher_id", publisher.id)
        .order("created_at", { ascending: false });

    const appList = apps ?? [];

    return (
        <div>
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-nd-lg mb-nd-2xl">
                <div>
                    <h1 className="font-body text-nd-heading font-bold text-nd-text-display tracking-tight">
                        Apps
                    </h1>
                    <p className="text-nd-body-sm text-nd-text-secondary mt-nd-2xs">
                        {appList.length === 0
                            ? "No apps yet"
                            : `${appList.length} app${appList.length === 1 ? "" : "s"}`}
                    </p>
                </div>
                <CreateAppForm />
            </div>

            {/* ── App grid ── */}
            {appList.length === 0 ? (
                <div className="card flex flex-col items-center text-center px-nd-lg py-nd-3xl">
                    <span className="flex items-center justify-center w-12 h-12 rounded-nd-card bg-nd-brand-subtle text-nd-brand-hover mb-nd-md">
                        <Package size={24} weight="fill" />
                    </span>
                    <p className="text-nd-body font-medium text-nd-text-primary">No apps yet</p>
                    <p className="mt-nd-2xs text-nd-body-sm text-nd-text-secondary max-w-sm">
                        Create your first app to start distributing private beta builds.
                    </p>
                </div>
            ) : (
                <div className="grid gap-nd-md sm:grid-cols-2">
                    {appList.map((app) => (
                        <Link
                            key={app.id}
                            href={`/dashboard/apps/${app.id}`}
                            className="card card-interactive group flex items-center gap-nd-md p-nd-md"
                        >
                            <span className="flex items-center justify-center w-11 h-11 shrink-0 rounded-nd-card bg-nd-surface-raised border border-nd-border font-mono text-nd-body-sm font-semibold text-nd-text-primary">
                                {monogram(app.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-nd-body font-semibold text-nd-text-display truncate">
                                    {app.name}
                                </p>
                                <p className="font-mono text-nd-caption text-nd-text-secondary truncate mt-0.5">
                                    {app.package_name}
                                </p>
                            </div>
                            <div className="flex items-center gap-nd-sm shrink-0">
                                <span className="hidden sm:inline text-nd-caption text-nd-text-disabled">
                                    {relativeTime(app.created_at)}
                                </span>
                                <CaretRight
                                    size={16}
                                    className="text-nd-text-disabled group-hover:text-nd-brand-hover transition-colors"
                                />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
