import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import PortalStatusSection from "./portal-status-section";

export const metadata: Metadata = {
    title: "Release Detail",
};

interface CheckItem {
    name: string;
    passed: boolean;
    detail: string;
}

interface CheckResults {
    passed: boolean;
    checks: CheckItem[];
}

interface ReleaseDetail {
    id: string;
    app_id: string;
    beta_track_id: string | null;
    version_name: string;
    version_code: number;
    status: string;
    release_notes: string | null;
    apk_sha256: string | null;
    check_results: CheckResults | null;
    dapp_store_submission_id: string | null;
    rejection_reason: string | null;
    submitted_at: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
}

interface PageProps {
    params: Promise<{ appId: string; releaseId: string }>;
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
            return { label: "CHECKING…", className: "text-nd-text-secondary" };
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

/**
 * /dashboard/apps/[appId]/releases/[releaseId] — release detail.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Version name — dot-grid hero, Doto display (ONE pattern break)
 *   Layer 2 (Secondary): Status machine timeline + pre-submission check results
 *   Layer 3 (Tertiary):  Metadata (SHA-256, version code, submission IDs)
 *
 * Accent red: check_failed / rejected status — one instance per screen.
 */
export default async function ReleaseDetailPage({ params }: PageProps) {
    const { appId, releaseId } = await params;

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

    const { data: release } = await admin
        .from("releases")
        .select(
            "id, app_id, beta_track_id, version_name, version_code, status, release_notes, apk_sha256, check_results, dapp_store_submission_id, rejection_reason, submitted_at, published_at, created_at, updated_at",
        )
        .eq("id", releaseId)
        .eq("app_id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!release) notFound();

    const r = release as ReleaseDetail;
    const style = releaseStatusStyle(r.status);
    const checkResults = r.check_results;

    // Build status timeline steps.
    const steps: Array<{ label: string; date: string | null; active: boolean }> = [
        { label: "CREATED", date: r.created_at, active: true },
        {
            label: "CHECKS",
            date: null,
            active: ["check_pending", "check_passed", "check_failed", "submitted", "in_review", "published", "rejected"].includes(r.status),
        },
        {
            label: "SUBMITTED",
            date: r.submitted_at,
            active: ["submitted", "in_review", "published", "rejected"].includes(r.status),
        },
        {
            label: "IN REVIEW",
            date: null,
            active: ["in_review", "published", "rejected"].includes(r.status),
        },
        {
            label: r.status === "rejected" ? "REJECTED" : "PUBLISHED",
            date: r.published_at,
            active: r.status === "published" || r.status === "rejected",
        },
    ];

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
                    href={`/dashboard/apps/${app.id}/releases`}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    RELEASES
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    {r.version_name}
                </span>
            </div>

            {/* ── Layer 1: dot-grid hero (ONE pattern break) ── */}
            <div className="relative bg-nd-dot-grid bg-nd-dot-16 border border-nd-border p-nd-xl mb-nd-2xl overflow-hidden">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xl">
                    RELEASE
                </p>
                <p className="font-display text-nd-display-lg text-nd-text-display leading-none mb-nd-sm">
                    {r.version_name}
                </p>
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] mb-nd-xl">
                    VERSION CODE {r.version_code}
                </p>
                <span
                    className={[
                        "inline-block font-mono text-nd-label uppercase tracking-[0.08em]",
                        style.className,
                    ].join(" ")}
                >
                    {style.label}
                </span>
            </div>

            {/* ── Layer 2: Status timeline ── */}
            <section className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    PIPELINE
                </p>
                <div className="border border-nd-border">
                    {steps.map((step, i) => (
                        <div
                            key={i}
                            className={[
                                "flex items-center justify-between px-nd-lg py-nd-md border-b border-nd-border last:border-b-0",
                                step.active ? "bg-transparent" : "opacity-40",
                            ].join(" ")}
                        >
                            <span
                                className={[
                                    "font-mono text-nd-label uppercase tracking-[0.08em]",
                                    step.active ? "text-nd-text-primary" : "text-nd-text-disabled",
                                ].join(" ")}
                            >
                                {step.label}
                            </span>
                            {step.date ? (
                                <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em]">
                                    {formatDate(step.date)}
                                </span>
                            ) : (
                                step.active && (
                                    <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em]">
                                        —
                                    </span>
                                )
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Layer 2: Portal status sync (submitted / in_review states) ── */}
            {["submitted", "in_review", "published", "rejected"].includes(r.status) && (
                <PortalStatusSection
                    releaseId={r.id}
                    currentStatus={r.status}
                    submissionId={r.dapp_store_submission_id}
                />
            )}

            {/* ── Layer 2: Pre-submission check results ── */}
            {checkResults && (
                <section className="mb-nd-2xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                        PRE-SUBMISSION CHECKS
                    </p>
                    <div className="border border-nd-border divide-y divide-nd-border">
                        {checkResults.checks.map((check: CheckItem, i: number) => (
                            <div key={i} className="flex items-start justify-between px-nd-lg py-nd-md gap-nd-lg">
                                <div className="flex flex-col gap-nd-xs min-w-0">
                                    <span className="font-mono text-nd-label text-nd-text-primary uppercase tracking-[0.08em]">
                                        {check.name.replace(/_/g, " ")}
                                    </span>
                                    <span className="font-mono text-nd-label text-nd-text-secondary text-xs">
                                        {check.detail}
                                    </span>
                                </div>
                                <span
                                    className={[
                                        "font-mono text-nd-label uppercase tracking-[0.08em] shrink-0",
                                        check.passed ? "text-nd-text-secondary" : "text-nd-accent",
                                    ].join(" ")}
                                >
                                    {check.passed ? "PASS" : "FAIL"}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p
                        className={[
                            "font-mono text-nd-label uppercase tracking-[0.08em] mt-nd-md",
                            checkResults.passed ? "text-nd-text-secondary" : "text-nd-accent",
                        ].join(" ")}
                    >
                        {checkResults.passed
                            ? `ALL ${checkResults.checks.length} CHECKS PASSED`
                            : `${checkResults.checks.filter((c: CheckItem) => !c.passed).length} OF ${checkResults.checks.length} CHECKS FAILED`}
                    </p>
                </section>
            )}

            {/* ── Layer 2: Release notes ── */}
            {r.release_notes && (
                <section className="mb-nd-2xl">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                        RELEASE NOTES
                    </p>
                    <div className="border border-nd-border p-nd-lg">
                        <p className="font-sans text-nd-body text-nd-text-secondary whitespace-pre-wrap">
                            {r.release_notes}
                        </p>
                    </div>
                </section>
            )}

            {/* ── Layer 2: Rejection reason ── */}
            {r.rejection_reason && (
                <section className="mb-nd-2xl">
                    <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em] mb-nd-lg">
                        REJECTION REASON
                    </p>
                    <div className="border border-nd-border p-nd-lg">
                        <p className="font-sans text-nd-body text-nd-text-secondary whitespace-pre-wrap">
                            {r.rejection_reason}
                        </p>
                    </div>
                </section>
            )}

            {/* ── Layer 3: Metadata grid ── */}
            <section>
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    METADATA
                </p>
                <div className="border border-nd-border divide-y divide-nd-border">
                    <MetaRow label="RELEASE ID" value={r.id} mono />
                    <MetaRow label="VERSION CODE" value={String(r.version_code)} mono />
                    {r.apk_sha256 && (
                        <MetaRow label="APK SHA-256" value={r.apk_sha256.slice(0, 16) + "…"} mono />
                    )}
                    {r.beta_track_id && (
                        <MetaRow
                            label="BETA TRACK"
                            value={r.beta_track_id}
                            mono
                            href={`/dashboard/apps/${app.id}/tracks/${r.beta_track_id}`}
                        />
                    )}
                    {r.dapp_store_submission_id && (
                        <MetaRow
                            label="DAPP STORE SUBMISSION"
                            value={r.dapp_store_submission_id}
                            mono
                        />
                    )}
                    <MetaRow label="CREATED" value={formatDate(r.created_at)} />
                    <MetaRow label="LAST UPDATED" value={formatDate(r.updated_at)} />
                </div>
            </section>
        </div>
    );
}

function MetaRow({
    label,
    value,
    mono = false,
    href,
}: {
    label: string;
    value: string;
    mono?: boolean;
    href?: string;
}) {
    return (
        <div className="flex items-start justify-between gap-nd-lg px-nd-lg py-nd-md">
            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] shrink-0">
                {label}
            </span>
            {href ? (
                <Link
                    href={href}
                    className={[
                        "text-nd-text-secondary hover:text-nd-text-primary transition-colors text-right break-all",
                        mono ? "font-mono text-nd-label" : "font-sans text-nd-body",
                    ].join(" ")}
                >
                    {value}
                </Link>
            ) : (
                <span
                    className={[
                        "text-nd-text-secondary text-right break-all",
                        mono ? "font-mono text-nd-label" : "font-sans text-nd-body",
                    ].join(" ")}
                >
                    {value}
                </span>
            )}
        </div>
    );
}
