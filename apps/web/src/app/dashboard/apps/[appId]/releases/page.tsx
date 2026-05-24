import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Releases",
};

interface ReleaseRow {
    id: string;
    version_name: string;
    version_code: number;
    status: string;
    release_notes: string | null;
    apk_sha256: string | null;
    check_results: { passed: boolean; checks: unknown[] } | null;
    dapp_store_submission_id: string | null;
    submitted_at: string | null;
    published_at: string | null;
    created_at: string;
}

type StatusFilter = "all" | "active" | "submitted" | "published";

interface PageProps {
    params: Promise<{ appId: string }>;
    searchParams: Promise<{ status?: string; cursor?: string }>;
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

type StatusStyle = { label: string; className: string };

function releaseStatusStyle(status: string): StatusStyle {
    switch (status) {
        case "published":
            return { label: "PUBLISHED", className: "text-nd-text-display" };
        case "in_review":
            return { label: "IN REVIEW", className: "text-nd-text-secondary" };
        case "submitted":
            return { label: "SUBMITTED", className: "text-nd-text-secondary" };
        case "check_passed":
            return { label: "CHECKS PASSED", className: "text-nd-text-secondary" };
        case "check_pending":
            return { label: "CHECKING", className: "text-nd-text-secondary" };
        case "check_failed":
            return { label: "CHECK FAILED", className: "text-nd-accent" };
        case "rejected":
            return { label: "REJECTED", className: "text-nd-accent" };
        case "draft":
            return { label: "DRAFT", className: "text-nd-text-disabled" };
        default:
            return { label: status.toUpperCase(), className: "text-nd-text-disabled" };
    }
}

const PAGE_SIZE = 20;

/**
 * /dashboard/apps/[appId]/releases — version release history.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Published count — dot-grid hero, Doto display (ONE pattern break)
 *   Layer 2 (Secondary): Status filter tabs + releases table
 *   Layer 3 (Tertiary):  Per-row metadata (version code, submitted date)
 *
 * Accent red: check_failed / rejected status label — one instance per screen.
 */
export default async function ReleasesPage({ params, searchParams }: PageProps) {
    const { appId } = await params;
    const { status: rawStatus, cursor } = await searchParams;

    const status: StatusFilter =
        rawStatus === "active" || rawStatus === "submitted" || rawStatus === "published"
            ? rawStatus
            : "all";

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

    // Count published releases for hero KPI.
    const { count: publishedCount } = await admin
        .from("releases")
        .select("id", { count: "exact", head: true })
        .eq("app_id", appId)
        .eq("publisher_id", publisher.id)
        .eq("status", "published");

    // Build list query.
    let query = admin
        .from("releases")
        .select(
            "id, version_name, version_code, status, release_notes, apk_sha256, check_results, dapp_store_submission_id, submitted_at, published_at, created_at",
        )
        .eq("app_id", appId)
        .eq("publisher_id", publisher.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

    if (status === "active") {
        query = query.in("status", ["draft", "check_pending", "check_passed", "check_failed"]);
    } else if (status === "submitted") {
        query = query.in("status", ["submitted", "in_review"]);
    } else if (status === "published") {
        query = query.in("status", ["published", "rejected"]);
    }

    // Cursor pagination.
    if (cursor) {
        const { data: cursorRow } = await admin
            .from("releases")
            .select("created_at")
            .eq("id", cursor)
            .eq("publisher_id", publisher.id)
            .maybeSingle();

        if (cursorRow) {
            query = query.lt("created_at", cursorRow.created_at);
        }
    }

    const { data: releaseData } = await query;
    const rows = (releaseData ?? []) as ReleaseRow[];
    const hasMore = rows.length > PAGE_SIZE;
    const releases = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? (releases.at(-1)?.id ?? null) : null;

    const baseUrl = `/dashboard/apps/${app.id}/releases`;

    function filterUrl(s: StatusFilter) {
        return s === "all" ? baseUrl : `${baseUrl}?status=${s}`;
    }

    function nextPageUrl() {
        const queryParams = new URLSearchParams();
        if (status !== "all") queryParams.set("status", status);
        if (nextCursor) queryParams.set("cursor", nextCursor);
        const qs = queryParams.toString();
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
                    RELEASES
                </span>
            </div>

            {/* ── Layer 1: dot-grid hero (ONE pattern break) ── */}
            <div className="relative bg-nd-dot-grid bg-nd-dot-16 border border-nd-border p-nd-xl mb-nd-2xl overflow-hidden">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xl">
                    {app.name} — RELEASE HISTORY
                </p>
                <div className="flex items-end gap-nd-2xl">
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] mb-nd-sm">
                            PUBLISHED
                        </p>
                        <p className="font-display text-nd-display-lg text-nd-text-display leading-none">
                            {publishedCount ?? 0}
                        </p>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                            RELEASES ON DAPP STORE
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Layer 2: Status filter + releases table ── */}

            {/* Segmented filter */}
            <div
                className="flex items-center border border-nd-border-visible rounded-full w-fit mb-nd-xl"
                role="tablist"
                aria-label="Release status filter"
            >
                {(["all", "active", "submitted", "published"] as StatusFilter[]).map((s) => (
                    <Link
                        key={s}
                        href={filterUrl(s)}
                        role="tab"
                        aria-selected={status === s}
                        className={[
                            "font-mono text-nd-label uppercase tracking-[0.08em] px-nd-lg py-nd-sm rounded-full transition-colors",
                            status === s
                                ? "bg-nd-text-display text-nd-black"
                                : "text-nd-text-secondary hover:text-nd-text-primary",
                        ].join(" ")}
                    >
                        {s.toUpperCase()}
                    </Link>
                ))}
            </div>

            {/* Releases list */}
            {releases.length === 0 ? (
                <div className="border border-nd-border p-nd-xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        {cursor ? "NO MORE RELEASES" : "NO RELEASES YET"}
                    </p>
                    {!cursor && (
                        <p className="font-sans text-nd-body text-nd-text-secondary mt-nd-sm">
                            Use the{" "}
                            <code className="font-mono text-nd-code bg-nd-surface-raised px-1">
                                canopy-dev/action-release
                            </code>{" "}
                            GitHub Action or the Canopy CLI to create a release.
                        </p>
                    )}
                </div>
            ) : (
                <div className="border border-nd-border divide-y divide-nd-border">
                    {releases.map((release) => {
                        const style = releaseStatusStyle(release.status);
                        const checksPassed = release.check_results?.passed;

                        return (
                            <Link
                                key={release.id}
                                href={`/dashboard/apps/${app.id}/releases/${release.id}`}
                                className="flex items-center justify-between p-nd-lg hover:bg-nd-surface-raised transition-colors group"
                            >
                                {/* Left: version info */}
                                <div className="flex flex-col gap-nd-xs min-w-0">
                                    <div className="flex items-center gap-nd-md">
                                        <span className="font-mono text-nd-body text-nd-text-primary group-hover:text-nd-text-display transition-colors truncate">
                                            {release.version_name}
                                        </span>
                                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] shrink-0">
                                            CODE {release.version_code}
                                        </span>
                                    </div>

                                    {/* Layer 3: tertiary metadata */}
                                    <div className="flex items-center gap-nd-md flex-wrap">
                                        <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em]">
                                            {formatRelative(release.created_at)}
                                        </span>

                                        {checksPassed !== undefined && (
                                            <span
                                                className={[
                                                    "font-mono text-nd-label uppercase tracking-[0.06em]",
                                                    checksPassed ? "text-nd-text-disabled" : "text-nd-accent",
                                                ].join(" ")}
                                            >
                                                CHECKS {checksPassed ? "PASSED" : "FAILED"}
                                            </span>
                                        )}

                                        {release.submitted_at && (
                                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em]">
                                                SUBMITTED {formatRelative(release.submitted_at)}
                                            </span>
                                        )}

                                        {release.published_at && (
                                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em]">
                                                LIVE {formatRelative(release.published_at)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: status */}
                                <div className="flex items-center gap-nd-md ml-nd-lg shrink-0">
                                    <span
                                        className={[
                                            "font-mono text-nd-label uppercase tracking-[0.08em]",
                                            style.className,
                                        ].join(" ")}
                                    >
                                        {style.label}
                                    </span>
                                    <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* Load more */}
            {hasMore && nextCursor && (
                <div className="mt-nd-xl">
                    <Link
                        href={nextPageUrl()}
                        className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] hover:text-nd-text-primary transition-colors"
                    >
                        LOAD MORE ›
                    </Link>
                </div>
            )}
        </div>
    );
}
