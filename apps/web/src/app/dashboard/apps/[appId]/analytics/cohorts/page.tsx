import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { CohortDefinition } from "@canopy/types";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CohortBuilderClient } from "@/components/analytics/cohort-builder-client";

interface Props {
    params: Promise<{ appId: string }>;
}

export async function generateMetadata(_props: Props): Promise<Metadata> {
    return { title: "Cohort Builder" };
}

/**
 * /dashboard/apps/[appId]/analytics/cohorts
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Cohort count — dot-grid hero
 *   Layer 2 (Secondary): Cohort list with condition summary
 *   Layer 3 (Tertiary):  Evaluate + delete actions
 *
 * One accent red element: cohort count.
 */
export default async function CohortsPage({ params }: Props) {
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

    const { data: cohorts } = await admin
        .from("cohort_definitions")
        .select("*")
        .eq("app_id", appId)
        .order("created_at", { ascending: false });

    const allCohorts = (cohorts ?? []) as CohortDefinition[];

    return (
        <div className="min-h-full bg-black text-white p-8 space-y-10">
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
                            ON-CHAIN COHORTS
                        </h1>
                        <p className="mt-2 text-sm text-white/60 font-sans">
                            Define wallet segments by on-chain holding criteria. Evaluated
                            on-device via Helius DAS.
                        </p>
                    </div>

                    {/* Accent red — one per screen: cohort count */}
                    <div className="flex flex-col items-end">
                        <span className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                            COHORTS
                        </span>
                        <span
                            className="font-mono text-3xl font-bold"
                            style={{ color: "#D71921" }}
                        >
                            {allCohorts.length}
                        </span>
                    </div>
                </div>
            </header>

            {/* ── Layer 2 + 3: Cohort builder and list ──────────────────────── */}
            <CohortBuilderClient appId={appId} initialCohorts={allCohorts} />
        </div>
    );
}
