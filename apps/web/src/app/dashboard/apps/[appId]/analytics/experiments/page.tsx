import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { Experiment, ExperimentVariant } from "@canopy/types";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ExperimentListClient } from "@/components/analytics/experiment-list-client";

interface Props {
    params: Promise<{ appId: string }>;
}

export async function generateMetadata(_props: Props): Promise<Metadata> {
    return { title: "A/B Experiments" };
}

export type ExperimentWithVariants = Experiment & {
    experiment_variants: ExperimentVariant[];
};

/**
 * /dashboard/apps/[appId]/analytics/experiments
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Experiment count — dot-grid hero
 *   Layer 2 (Secondary): Experiment list with status + variant count
 *   Layer 3 (Tertiary):  Per-experiment actions (activate, view results, delete)
 *
 * One accent red element: experiment count.
 */
export default async function ExperimentsPage({ params }: Props) {
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

    const { data: remoteConfigs } = await admin
        .from("remote_configs")
        .select("id, key")
        .eq("app_id", appId)
        .eq("enabled", true)
        .order("key");

    const { data: rawExperiments } = await admin
        .from("experiments")
        .select("*")
        .eq("app_id", appId)
        .order("created_at", { ascending: false });

    const experimentIds = (rawExperiments ?? []).map((e) => e.id);
    const { data: allVariants } = experimentIds.length > 0
        ? await admin.from("experiment_variants").select("*").in("experiment_id", experimentIds)
        : { data: [] };

    const variantsByExp = new Map<string, ExperimentVariant[]>();
    for (const v of allVariants ?? []) {
        const arr = variantsByExp.get(v.experiment_id) ?? [];
        arr.push(v);
        variantsByExp.set(v.experiment_id, arr);
    }

    const allExperiments: ExperimentWithVariants[] = (rawExperiments ?? []).map((e) => ({
        ...e,
        experiment_variants: variantsByExp.get(e.id) ?? [],
    }));
    const configs = remoteConfigs ?? [];

    return (
        <div className="min-h-screen bg-black text-white p-8 space-y-10">
            {/* ── Layer 1: Hero ─────────────────────────────────────────────── */}
            <header className="relative overflow-hidden border border-white/10 p-8">
                {/* Dot-grid pattern — one per screen */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                        backgroundSize: "16px 16px",
                    }}
                />

                <div className="relative flex items-start justify-between">
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-2">
                            {app.name}
                        </p>
                        <h1 className="font-mono text-3xl font-bold tracking-tight">
                            A/B EXPERIMENTS
                        </h1>
                        <p className="mt-2 text-sm text-white/60 font-sans">
                            Wallet-keyed variant assignment via remote config. Results correlated
                            to analytics events.
                        </p>
                    </div>

                    {/* Accent red — one per screen: experiment count */}
                    <div className="flex flex-col items-end">
                        <span className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                            EXPERIMENTS
                        </span>
                        <span
                            className="font-mono text-3xl font-bold"
                            style={{ color: "#D71921" }}
                        >
                            {allExperiments.length}
                        </span>
                    </div>
                </div>
            </header>

            {/* ── Layer 2 + 3: Experiment list and create form ──────────────── */}
            <ExperimentListClient
                appId={appId}
                initialExperiments={allExperiments}
                remoteConfigs={configs}
            />
        </div>
    );
}
