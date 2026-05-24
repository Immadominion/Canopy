import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Analytics",
};

interface SummaryRow {
    bucket: string;
    distinct_wallets: number;
    event_count: number;
}

/**
 * analytics_seeker_daily view: two rows per day per app
 * (one for is_seeker=true, one for is_seeker=false)
 */
interface SeekerRow {
    bucket: string;
    is_seeker: boolean;
    distinct_wallets: number;
}

/** get_nft_cohorts RPC result row */
interface NftCohortRow {
    has_genesis_token: boolean;
    distinct_wallets: number;
}

interface TopEvent {
    event_name: string;
    event_count: number;
    pct: number;
}

interface MwaFunnelStep {
    step: string;
    wallet_count: number;
}

interface SkrTier {
    tier: string;
    wallet_count: number;
}

function formatCount(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
}

interface PageProps {
    params: Promise<{ appId: string }>;
}

/**
 * /dashboard/apps/[appId]/analytics — analytics overview.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   DAU — Doto display font in dot-grid hero section (one pattern break)
 *   Layer 2 (Secondary): WAU / MAU / TOTAL EVENTS + Seeker vs Non-Seeker breakdown
 *   Layer 3 (Tertiary):  30-day sparkline bar chart
 *
 * One accent red per screen: Seeker segment in the ratio bar.
 */
export default async function AnalyticsPage({ params }: PageProps) {
    const { appId } = await params;

    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    // Verify app ownership
    const { data: app } = await admin
        .from("apps")
        .select("id, name, package_name")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!app) notFound();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Always include a time range — analytics_events is a TimescaleDB hypertable.
    const { data: summaryData } = await admin
        .from("analytics_daw_daily")
        .select("bucket, distinct_wallets, event_count")
        .eq("app_id", appId)
        .gte("bucket", thirtyDaysAgo)
        .order("bucket", { ascending: true });

    const { data: seekerData } = await admin
        .from("analytics_seeker_daily")
        .select("bucket, is_seeker, distinct_wallets")
        .eq("app_id", appId)
        .gte("bucket", thirtyDaysAgo)
        .order("bucket", { ascending: true });

    // Top events, MWA funnel, SKR tiers, and NFT cohorts — run in parallel
    const [topEventsResult, mwaFunnelResult, skrTiersResult, nftCohortsResult] = await Promise.all([
        admin.rpc("get_top_events", { _app_id: appId, _since: thirtyDaysAgo, _limit: 10 }),
        admin.rpc("get_mwa_funnel", { _app_id: appId, _since: thirtyDaysAgo }),
        admin.rpc("get_skr_tiers", { _app_id: appId, _since: thirtyDaysAgo }),
        admin.rpc("get_nft_cohorts", { _app_id: appId, _since: thirtyDaysAgo }),
    ]);

    const topEvents = (topEventsResult.data ?? []) as TopEvent[];
    const mwaFunnel = (mwaFunnelResult.data ?? []) as MwaFunnelStep[];
    const skrTiers = (skrTiersResult.data ?? []) as SkrTier[];
    const nftCohortRows = (nftCohortsResult.data ?? []) as NftCohortRow[];

    const summaryRows = (summaryData ?? []) as SummaryRow[];
    const seekerRows = (seekerData ?? []) as SeekerRow[];

    // Compute rolling windows
    const now = Date.now();
    const dau = summaryRows
        .filter((r) => new Date(r.bucket).getTime() >= now - 86_400_000)
        .reduce((acc, r) => acc + r.distinct_wallets, 0);
    const wau = summaryRows
        .filter((r) => new Date(r.bucket).getTime() >= now - 7 * 86_400_000)
        .reduce((acc, r) => acc + r.distinct_wallets, 0);
    const mau = summaryRows.reduce((acc, r) => acc + r.distinct_wallets, 0);
    const totalEvents = summaryRows.reduce((acc, r) => acc + r.event_count, 0);

    // Group seeker rows: view has two rows per day (is_seeker=true + false)
    let seekerWallets = 0;
    let nonSeekerWallets = 0;
    seekerRows.forEach((r) => {
        if (r.is_seeker) seekerWallets += r.distinct_wallets;
        else nonSeekerWallets += r.distinct_wallets;
    });
    const seekerTotals = { seekerWallets, nonSeekerWallets };

    const totalWallets = seekerTotals.seekerWallets + seekerTotals.nonSeekerWallets;
    const seekerPct =
        totalWallets === 0 ? 0 : Math.round((seekerTotals.seekerWallets / totalWallets) * 100);

    // NFT cohort: Genesis Token holders vs non-holders
    const nftHolders = nftCohortRows.find((r) => r.has_genesis_token)?.distinct_wallets ?? 0;
    const nftNonHolders = nftCohortRows.find((r) => !r.has_genesis_token)?.distinct_wallets ?? 0;
    const nftTotal = nftHolders + nftNonHolders;
    const nftHolderPct = nftTotal === 0 ? 0 : Math.round((nftHolders / nftTotal) * 100);

    const maxWallets = Math.max(...summaryRows.map((r) => r.distinct_wallets), 1);

    const firstBucket = summaryRows.at(0)?.bucket ?? new Date().toISOString();
    const lastBucket = summaryRows.at(-1)?.bucket ?? new Date().toISOString();

    // MWA funnel — build ordered map with zero-fallback for missing steps
    const MWA_STEPS = [
        { key: "mwa_wallet_connected", label: "WALLET CONNECTED" },
        { key: "mwa_session_start", label: "SESSION STARTED" },
        { key: "mwa_transaction_signed", label: "TRANSACTION SIGNED" },
    ] as const;
    const mwaStepMap = new Map<string, number>(mwaFunnel.map((s) => [s.step, s.wallet_count]));
    const mwaMax = Math.max(...MWA_STEPS.map((s) => mwaStepMap.get(s.key) ?? 0), 1);

    // SKR tiers — ordered and labeled
    const SKR_ORDER = ["high", "medium", "low", "none"] as const;
    const skrTierMap = new Map<string, number>(skrTiers.map((t) => [t.tier, t.wallet_count]));
    const skrTotal = skrTiers.reduce((acc, t) => acc + t.wallet_count, 0);
    const skrMax = Math.max(...skrTiers.map((t) => t.wallet_count), 1);

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
                    href={"/dashboard/apps/" + app.id}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    {app.name}
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    ANALYTICS
                </span>
            </div>

            {/* ── Layer 1 + Pattern break: dot-grid KPI hero ── */}
            {/*
          The dot-grid background and Doto display font are the ONE pattern break
          for this screen — everything else is rigidly consistent Nothing Design.
      */}
            <div className="relative bg-nd-dot-grid bg-nd-dot-16 border border-nd-border p-nd-xl mb-nd-2xl overflow-hidden">
                {/* Section label */}
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xl">
                    {app.name} — 30 DAY WINDOW
                </p>

                <div className="grid grid-cols-2 gap-nd-xl sm:grid-cols-4">
                    {/* DAU — primary hero with Doto font */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            DAU
                        </p>
                        <p className="font-display text-nd-display-lg text-nd-text-display leading-none">
                            {formatCount(dau)}
                        </p>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                            WALLETS / DAY
                        </p>
                    </div>

                    {/* WAU */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            WAU
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-primary leading-none">
                            {formatCount(wau)}
                        </p>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                            WALLETS / WEEK
                        </p>
                    </div>

                    {/* MAU */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            MAU
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-primary leading-none">
                            {formatCount(mau)}
                        </p>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                            WALLETS / MONTH
                        </p>
                    </div>

                    {/* Total events */}
                    <div>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                            EVENTS
                        </p>
                        <p className="font-mono text-nd-display-md text-nd-text-primary leading-none">
                            {formatCount(totalEvents)}
                        </p>
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                            TOTAL / 30 DAYS
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Layer 2a: Seeker breakdown ── */}
            <div className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    SEEKER BREAKDOWN — 30 DAYS
                </p>

                {totalWallets === 0 ? (
                    <div className="border-t border-nd-border pt-nd-xl">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            NO WALLET DATA YET
                        </p>
                        <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                            Seeker vs non-Seeker breakdown will appear once users connect their
                            wallets through your app.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Ratio bar — accent red is the ONE interrupt on this screen */}
                        <div
                            className="flex h-0.5 mb-nd-xl overflow-hidden"
                            role="img"
                            aria-label={"Seeker " + String(seekerPct) + "%, Non-Seeker " + String(100 - seekerPct) + "%"}
                        >
                            <div className="bg-nd-accent" style={{ width: String(seekerPct) + "%" }} />
                            <div className="flex-1 bg-nd-border-visible" />
                        </div>

                        <div className="grid grid-cols-2 gap-nd-xl border-t border-nd-border pt-nd-lg">
                            {/* Seeker */}
                            <div>
                                <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em] mb-nd-sm">
                                    SEEKER
                                </p>
                                <p className="font-mono text-nd-heading text-nd-text-display leading-none">
                                    {formatCount(seekerTotals.seekerWallets)}
                                </p>
                                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                                    {String(seekerPct)}% OF WALLETS
                                </p>
                            </div>

                            {/* Non-Seeker */}
                            <div>
                                <p className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] mb-nd-sm">
                                    NON-SEEKER
                                </p>
                                <p className="font-mono text-nd-heading text-nd-text-primary leading-none">
                                    {formatCount(seekerTotals.nonSeekerWallets)}
                                </p>
                                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                                    {String(100 - seekerPct)}% OF WALLETS
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Layer 2b: NFT cohort breakdown (Genesis Token holders) ── */}
            <div className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    GENESIS TOKEN HOLDERS — 30 DAYS
                </p>

                {nftTotal === 0 ? (
                    <div className="border-t border-nd-border pt-nd-xl">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            NO NFT COHORT DATA YET
                        </p>
                        <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                            Genesis Token holder breakdown will appear once wallets with NFT
                            data interact with your app.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Holder ratio bar */}
                        <div
                            className="flex h-0.5 mb-nd-xl overflow-hidden"
                            role="img"
                            aria-label={"Genesis Token holders " + String(nftHolderPct) + "%, non-holders " + String(100 - nftHolderPct) + "%"}
                        >
                            <div className="bg-nd-border-visible" style={{ width: String(nftHolderPct) + "%" }} />
                            <div className="flex-1 bg-nd-border" />
                        </div>

                        <div className="grid grid-cols-2 gap-nd-xl border-t border-nd-border pt-nd-lg">
                            {/* Genesis Token holders */}
                            <div>
                                <p className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] mb-nd-sm">
                                    GENESIS TOKEN
                                </p>
                                <p className="font-mono text-nd-heading text-nd-text-display leading-none">
                                    {formatCount(nftHolders)}
                                </p>
                                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                                    {String(nftHolderPct)}% OF WALLETS
                                </p>
                            </div>

                            {/* Non-holders */}
                            <div>
                                <p className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] mb-nd-sm">
                                    NON-HOLDER
                                </p>
                                <p className="font-mono text-nd-heading text-nd-text-primary leading-none">
                                    {formatCount(nftNonHolders)}
                                </p>
                                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                                    {String(100 - nftHolderPct)}% OF WALLETS
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Layer 3: Daily wallet trend sparkline ── */}
            <div>
                <div className="flex items-center justify-between mb-nd-md">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        WALLET TREND — 30 DAYS
                    </p>
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                        PEAK {"  "} {formatCount(maxWallets)}
                    </p>
                </div>

                {summaryRows.length === 0 ? (
                    <div className="border-t border-nd-border pt-nd-xl">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            NO EVENTS RECORDED YET
                        </p>
                        <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                            Install the{" "}
                            <code className="font-mono text-nd-text-secondary">@canopy/react-native</code> SDK in
                            your app to start capturing analytics.
                        </p>
                    </div>
                ) : (
                    <div className="border-t border-nd-border pt-nd-md">
                        {/* Bar chart — each day is a bar, height proportional to wallet count */}
                        <div className="flex items-end gap-px h-16" role="img" aria-label="30-day wallet trend">
                            {summaryRows.map((r) => {
                                const barHeight = Math.max(1, Math.round((r.distinct_wallets / maxWallets) * 64));
                                return (
                                    <div
                                        key={r.bucket}
                                        className="flex-1 bg-nd-border-visible hover:bg-nd-text-disabled transition-colors cursor-default"
                                        style={{ height: String(barHeight) + "px" }}
                                        title={formatDate(r.bucket) + " — " + String(r.distinct_wallets) + " wallets"}
                                    />
                                );
                            })}
                        </div>

                        {/* Date range labels */}
                        <div className="flex justify-between mt-nd-sm">
                            <p className="font-mono text-nd-label text-nd-text-disabled tracking-[0.04em]">
                                {formatDate(firstBucket)}
                            </p>
                            <p className="font-mono text-nd-label text-nd-text-disabled tracking-[0.04em]">
                                {formatDate(lastBucket)}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Top Events Table ── */}
            <div className="mt-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    TOP EVENTS — 30 DAYS
                </p>

                {topEvents.length === 0 ? (
                    <div className="border-t border-nd-border pt-nd-xl">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            NO EVENTS RECORDED YET
                        </p>
                    </div>
                ) : (
                    <div className="border-t border-nd-border">
                        {topEvents.map((ev, i) => (
                            <div
                                key={ev.event_name}
                                className="flex items-center gap-nd-md border-b border-nd-border py-nd-md"
                            >
                                {/* Rank */}
                                <span className="font-mono text-nd-label text-nd-text-disabled w-6 shrink-0">
                                    {String(i + 1).padStart(2, "0")}
                                </span>

                                {/* Event name + bar */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-mono text-nd-body-sm text-nd-text-primary truncate mb-nd-xs">
                                        {ev.event_name}
                                    </p>
                                    {/* Percentage bar */}
                                    <div className="h-px bg-nd-border-visible">
                                        <div
                                            className="h-px bg-nd-text-secondary"
                                            style={{ width: String(ev.pct) + "%" }}
                                        />
                                    </div>
                                </div>

                                {/* Count */}
                                <span className="font-mono text-nd-body-sm text-nd-text-primary shrink-0 tabular-nums">
                                    {formatCount(ev.event_count)}
                                </span>

                                {/* Percentage */}
                                <span className="font-mono text-nd-label text-nd-text-disabled w-12 text-right shrink-0 tabular-nums">
                                    {String(ev.pct)}%
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── MWA Funnel ── */}
            <div className="mt-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    MWA WALLET FUNNEL — 30 DAYS
                </p>

                {mwaFunnel.length === 0 ? (
                    <div className="border-t border-nd-border pt-nd-xl">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            NO MWA EVENTS RECORDED YET
                        </p>
                        <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                            Use{" "}
                            <code className="font-mono text-nd-text-secondary">useCanopyTransact()</code> in your
                            app to auto-capture MWA lifecycle events.
                        </p>
                    </div>
                ) : (
                    <div className="border-t border-nd-border">
                        {MWA_STEPS.map((s, i) => {
                            const count = mwaStepMap.get(s.key) ?? 0;
                            const barW = count === 0 ? 0 : Math.max(2, Math.round((count / mwaMax) * 100));
                            const topCount = mwaStepMap.get(MWA_STEPS[0].key) ?? 1;
                            const convPct =
                                i === 0 || topCount === 0 ? null : Math.round((count / topCount) * 100);

                            return (
                                <div key={s.key} className="border-b border-nd-border py-nd-lg">
                                    <div className="flex items-center justify-between mb-nd-sm">
                                        <p className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                                            {s.label}
                                        </p>
                                        <div className="flex items-center gap-nd-lg">
                                            {convPct !== null && (
                                                <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                                    {String(convPct)}% CONV
                                                </span>
                                            )}
                                            <span className="font-mono text-nd-body-sm text-nd-text-primary tabular-nums">
                                                {formatCount(count)}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Funnel bar — width proportional to top step */}
                                    <div className="h-1 bg-nd-border rounded-full">
                                        <div
                                            className="h-1 bg-nd-border-visible rounded-full transition-all"
                                            style={{ width: String(barW) + "%" }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── SKR Balance Tier Breakdown ── */}
            <div className="mt-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    SKR BALANCE TIERS — 30 DAYS
                </p>

                {skrTotal === 0 ? (
                    <div className="border-t border-nd-border pt-nd-xl">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            NO SKR TIER DATA YET
                        </p>
                        <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                            SKR balance tier is recorded when wallets connect. Data will appear once users
                            interact with your app.
                        </p>
                    </div>
                ) : (
                    <div className="border-t border-nd-border">
                        {SKR_ORDER.map((tier) => {
                            const count = skrTierMap.get(tier) ?? 0;
                            const barW = count === 0 ? 0 : Math.max(2, Math.round((count / skrMax) * 100));
                            const pct = skrTotal === 0 ? 0 : Math.round((count / skrTotal) * 100);

                            return (
                                <div key={tier} className="border-b border-nd-border py-nd-lg">
                                    <div className="flex items-center justify-between mb-nd-sm">
                                        <p className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                                            {tier.toUpperCase()}
                                        </p>
                                        <div className="flex items-center gap-nd-lg">
                                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                                {String(pct)}%
                                            </span>
                                            <span className="font-mono text-nd-body-sm text-nd-text-primary tabular-nums">
                                                {formatCount(count)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-px bg-nd-border-visible">
                                        <div
                                            className="h-px bg-nd-text-secondary"
                                            style={{ width: String(barW) + "%" }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {/* ── Explorer links ── */}
            <div className="mt-nd-2xl border-t border-nd-border pt-nd-xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    EXPLORE
                </p>
                <div className="flex flex-col gap-nd-md">
                    <Link
                        href={"/dashboard/apps/" + app.id + "/analytics/events"}
                        className="flex items-center justify-between border border-nd-border p-nd-lg hover:border-nd-border-visible transition-colors group"
                    >
                        <div>
                            <p className="font-mono text-nd-body-sm text-nd-text-primary uppercase tracking-[0.08em] group-hover:text-nd-text-display transition-colors">
                                EVENT PROPERTIES EXPLORER
                            </p>
                            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mt-nd-xs">
                                INSPECT PROPERTY KEY FREQUENCIES PER EVENT
                            </p>
                        </div>
                        <span className="font-mono text-nd-label text-nd-text-disabled">→</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
