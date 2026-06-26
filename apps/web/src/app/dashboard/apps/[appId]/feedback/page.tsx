import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CaretRight } from "@/components/ui/icon";
import { FeedbackStatusControl } from "@/components/beta/feedback-status-control";

export const metadata: Metadata = {
    title: "Feedback",
};

interface PageProps {
    params: Promise<{ appId: string }>;
}

/**
 * /dashboard/apps/[appId]/feedback — tester feedback inbox.
 *
 * Written feedback (optionally with a screenshot) left by testers across all of
 * this app's builds, newest first. Each item can be triaged open → resolved →
 * archived.
 */
export default async function AppFeedbackPage({ params }: PageProps) {
    const { appId } = await params;
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

    const { data: tracks } = await admin
        .from("beta_tracks")
        .select("id, version_name, version_code")
        .eq("app_id", app.id);
    const trackList = tracks ?? [];
    const versionByTrack = new Map(
        trackList.map((t) => [t.id, `${t.version_name} (${String(t.version_code)})`]),
    );
    const trackIds = trackList.map((t) => t.id);

    const feedback = trackIds.length
        ? (
              await admin
                  .from("beta_feedback")
                  .select(
                      "id, track_id, wallet_hash, message, screenshot_key, app_version_code, status, created_at",
                  )
                  .in("track_id", trackIds)
                  .order("created_at", { ascending: false })
                  .limit(200)
          ).data ?? []
        : [];

    const openCount = feedback.filter((f) => f.status === "open").length;

    return (
        <div className="max-w-3xl mx-auto">
            <nav className="flex items-center gap-nd-xs mb-nd-lg text-nd-body-sm" aria-label="Breadcrumb">
                <Link
                    href="/dashboard/apps"
                    className="text-nd-text-secondary hover:text-nd-text-primary transition-colors"
                >
                    Apps
                </Link>
                <CaretRight size={14} className="text-nd-text-disabled" />
                <Link
                    href={`/dashboard/apps/${app.id}`}
                    className="text-nd-text-secondary hover:text-nd-text-primary transition-colors"
                >
                    {app.name}
                </Link>
                <CaretRight size={14} className="text-nd-text-disabled" />
                <span className="text-nd-text-primary">Feedback</span>
            </nav>

            <header className="mb-nd-2xl">
                <h1 className="font-body text-nd-display-md text-nd-text-display leading-tight">
                    Feedback
                </h1>
                <p className="font-mono text-nd-caption text-nd-text-secondary mt-nd-sm">
                    {feedback.length} TOTAL · {openCount} OPEN
                </p>
            </header>

            {feedback.length === 0 ? (
                <p className="font-mono text-nd-caption text-nd-text-disabled border-t border-nd-border pt-nd-xl">
                    [ NO FEEDBACK YET ]
                </p>
            ) : (
                <div>
                    {feedback.map((fb) => (
                        <article
                            key={fb.id}
                            className="flex gap-nd-lg border-t border-nd-border py-nd-lg"
                        >
                            {fb.screenshot_key && (
                                <a
                                    href={`/api/v1/beta/feedback/${fb.id}/screenshot`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0"
                                >
                                    <img
                                        src={`/api/v1/beta/feedback/${fb.id}/screenshot`}
                                        alt="Feedback screenshot"
                                        className="w-16 h-16 rounded-nd-card-compact object-cover border border-nd-border"
                                    />
                                </a>
                            )}
                            <div className="min-w-0 flex-1">
                                <p
                                    className={`font-body text-nd-body-sm whitespace-pre-wrap ${
                                        fb.status === "archived"
                                            ? "text-nd-text-disabled"
                                            : "text-nd-text-primary"
                                    }`}
                                >
                                    {fb.message}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-nd-lg gap-y-nd-xs mt-nd-md">
                                    <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.06em]">
                                        {versionByTrack.get(fb.track_id) ?? "—"}
                                    </span>
                                    <span className="font-mono text-nd-label text-nd-text-disabled tracking-[0.04em]">
                                        {fb.wallet_hash.slice(0, 10)}…
                                    </span>
                                    <span className="font-mono text-nd-label text-nd-text-disabled tracking-[0.04em]">
                                        {new Date(fb.created_at)
                                            .toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            })
                                            .toUpperCase()}
                                    </span>
                                    <FeedbackStatusControl feedbackId={fb.id} status={fb.status} />
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
