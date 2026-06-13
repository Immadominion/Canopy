import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { RetentionClient } from "@/components/analytics/retention-client";

interface Props {
    params: Promise<{ appId: string }>;
}

export async function generateMetadata(_props: Props): Promise<Metadata> {
    return { title: "Retention Analytics" };
}

/**
 * /dashboard/apps/[appId]/analytics/retention
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Day-0 cohort size — dot-grid hero
 *   Layer 2 (Secondary): Retention grid (day × percentage)
 *   Layer 3 (Tertiary):  Day offset labels and raw counts
 *
 * One accent red element: day-0 wallet count.
 */
export default async function RetentionPage({ params }: Props) {
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

    // Server-side: fetch last 30 days retention for initial render
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const until = new Date().toISOString();

    const { data: retentionData } = await admin.rpc("get_retention", {
        _app_id: appId,
        _since: since,
        _until: until,
        _max_days: 30,
    });

    const retention = (retentionData ?? []) as Array<{
        day_offset: number;
        wallet_count: number;
    }>;

    const day0Count = retention.find((r) => r.day_offset === 0)?.wallet_count ?? 0;

    return (
        <div className="min-h-full bg-black text-white p-8 space-y-10">
            {/* ── Layer 1: Hero ─────────────────────────────────────────────── */}
            <header className="relative overflow-hidden border border-white/10 p-8">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle, white 1px, transparent 1px)",
                        backgroundSize: "16px 16px",
                    }}
                />
                <div className="relative flex items-start justify-between">
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-2">
                            {app.name}
                        </p>
                        <h1 className="font-mono text-3xl font-bold tracking-tight">
                            RETENTION
                        </h1>
                        <p className="mt-2 text-sm text-white/60 font-sans">
                            Day-N retention for wallets that first appeared in the last 30 days.
                        </p>
                    </div>

                    {/* Accent red — one per screen: cohort size */}
                    <div className="flex flex-col items-end">
                        <span className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                            COHORT (DAY 0)
                        </span>
                        <span
                            className="font-mono text-3xl font-bold tabular-nums"
                            style={{ color: "#D71921" }}
                        >
                            {day0Count.toLocaleString()}
                        </span>
                    </div>
                </div>
            </header>

            {/* ── Layer 2 + 3: Retention grid ──────────────────────────────── */}
            <RetentionClient appId={appId} initialRetention={retention} />
        </div>
    );
}
