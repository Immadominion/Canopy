import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ExperimentResultsClient } from "@/components/analytics/experiment-results-client";

interface Props {
    params: Promise<{ appId: string; experimentId: string }>;
}

export async function generateMetadata(_props: Props): Promise<Metadata> {
    return { title: "Experiment Results" };
}

/**
 * /dashboard/apps/[appId]/analytics/experiments/[experimentId]
 *
 * Shows variant-level metrics for an A/B experiment.
 * Uses the /api/v1/analytics/experiments/[experimentId]/results endpoint.
 */
export default async function ExperimentResultsPage({ params }: Props) {
    const { appId, experimentId } = await params;
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

    const { data: experimentBase } = await admin
        .from("experiments")
        .select("id, app_id, name, description, traffic_percentage, status, remote_config_id, started_at, concluded_at, created_at, updated_at")
        .eq("id", experimentId)
        .eq("app_id", appId)
        .maybeSingle();

    if (!experimentBase) notFound();

    const { data: variants } = await admin
        .from("experiment_variants")
        .select("*")
        .eq("experiment_id", experimentId);

    const experiment = { ...experimentBase, experiment_variants: variants ?? [] };

    return (
        <div className="min-h-full bg-black text-white p-8 space-y-10">
            {/* ── Header ───────────────────────────────────────────────────── */}
            <header className="relative overflow-hidden border border-white/10 p-8">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                        backgroundSize: "16px 16px",
                    }}
                />

                <div className="relative">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-2">
                        {app.name} / EXPERIMENTS
                    </p>
                    <h1 className="font-mono text-3xl font-bold tracking-tight">
                        {experiment.name.toUpperCase()}
                    </h1>
                    <p className="mt-2 text-sm text-white/60 font-sans">
                        Variant performance — events tagged with{" "}
                        <code className="font-mono text-white/80">ab_experiment_id</code> by
                        the SDK.
                    </p>
                </div>
            </header>

            {/* ── Results ──────────────────────────────────────────────────── */}
            <ExperimentResultsClient
                appId={appId}
                experimentId={experimentId}
                experiment={experiment}
            />
        </div>
    );
}
