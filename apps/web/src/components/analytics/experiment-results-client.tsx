"use client";

import { useEffect, useState } from "react";

import type { ExperimentVariant } from "@canopy/types";

interface ExperimentRow {
    id: string;
    name: string;
    status: string;
    started_at: string | null;
    concluded_at: string | null;
    traffic_percentage: number;
    experiment_variants: ExperimentVariant[];
}

interface VariantResult {
    variantId: string;
    variantName: string;
    eventCount: number;
    uniqueWallets: number;
}

interface ExperimentResultsClientProps {
    appId: string;
    experimentId: string;
    experiment: ExperimentRow;
}

export function ExperimentResultsClient({
    appId: _appId,
    experimentId,
    experiment,
}: ExperimentResultsClientProps) {
    const [results, setResults] = useState<VariantResult[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function fetchResults() {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams();
                if (experiment.started_at) {
                    params.set("since", experiment.started_at);
                }
                if (experiment.concluded_at) {
                    params.set("until", experiment.concluded_at);
                }

                const res = await fetch(
                    `/api/v1/analytics/experiments/${experimentId}/results?${params.toString()}`,
                    { signal: controller.signal },
                );

                if (!res.ok) {
                    const json = await res.json() as { error?: { message?: string } };
                    setError(json.error?.message ?? "Failed to load results.");
                    return;
                }

                const json = await res.json() as { results: VariantResult[] };
                setResults(json.results);
            } catch (err) {
                if ((err as { name?: string }).name !== "AbortError") {
                    setError("Network error loading results.");
                }
            } finally {
                setLoading(false);
            }
        }

        void fetchResults();
        return () => controller.abort();
    }, [experimentId, experiment.started_at, experiment.concluded_at]);

    const maxEvents = results
        ? Math.max(...results.map((r) => r.eventCount), 1)
        : 1;
    const maxWallets = results
        ? Math.max(...results.map((r) => r.uniqueWallets), 1)
        : 1;

    return (
        <div className="space-y-8">
            {/* Metadata */}
            <div className="border border-white/10 p-5 grid grid-cols-3 gap-6">
                <div>
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                        STATUS
                    </p>
                    <p className="font-mono text-sm text-white uppercase">
                        {experiment.status}
                    </p>
                </div>
                <div>
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                        TRAFFIC
                    </p>
                    <p className="font-mono text-sm text-white">
                        {String(experiment.traffic_percentage)}%
                    </p>
                </div>
                <div>
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                        VARIANTS
                    </p>
                    <p className="font-mono text-sm text-white">
                        {String(experiment.experiment_variants.length)}
                    </p>
                </div>
                {experiment.started_at && (
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                            STARTED
                        </p>
                        <p className="font-mono text-sm text-white">
                            {new Date(experiment.started_at).toLocaleDateString()}
                        </p>
                    </div>
                )}
                {experiment.concluded_at && (
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                            CONCLUDED
                        </p>
                        <p className="font-mono text-sm text-white">
                            {new Date(experiment.concluded_at).toLocaleDateString()}
                        </p>
                    </div>
                )}
            </div>

            {/* Results */}
            {loading && (
                <div className="border border-white/10 p-8 text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                        LOADING RESULTS…
                    </p>
                </div>
            )}

            {error && !loading && (
                <div className="border border-white/20 bg-white/5 p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/70">
                    {error}
                </div>
            )}

            {!loading && !error && results && results.length === 0 && (
                <div className="border border-white/10 p-8 text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                        NO DATA YET
                    </p>
                    <p className="mt-2 text-sm text-white/40 font-sans">
                        Analytics events tagged with{" "}
                        <code className="font-mono">ab_experiment_id</code> will appear here
                        once the SDK starts sending them.
                    </p>
                </div>
            )}

            {!loading && results && results.length > 0 && (
                <div className="space-y-4">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                        VARIANT COMPARISON
                    </p>

                    {/* Event count chart */}
                    <div className="border border-white/10 p-5 space-y-4">
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                            TOTAL EVENTS
                        </p>
                        {results.map((r) => {
                            const pct = (r.eventCount / maxEvents) * 100;
                            return (
                                <div key={r.variantId} className="space-y-1">
                                    <div className="flex justify-between font-mono text-xs">
                                        <span className="text-white/60">{r.variantName}</span>
                                        <span className="text-white tabular-nums">
                                            {r.eventCount.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 w-full">
                                        <div
                                            className="h-full bg-white/60 transition-all duration-300"
                                            style={{ width: `${String(pct)}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Unique wallet chart — accent red for the leading variant */}
                    <div className="border border-white/10 p-5 space-y-4">
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                            UNIQUE WALLETS
                        </p>
                        {results.map((r, idx) => {
                            const pct = (r.uniqueWallets / maxWallets) * 100;
                            const isLeader = r.uniqueWallets === maxWallets && idx === 0;
                            return (
                                <div key={r.variantId} className="space-y-1">
                                    <div className="flex justify-between font-mono text-xs">
                                        <span className="text-white/60">
                                            {r.variantName}
                                            {isLeader && (
                                                <span
                                                    className="ml-2 font-mono text-xs uppercase tracking-[0.08em]"
                                                    style={{ color: "#D71921" }}
                                                >
                                                    LEADING
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-white tabular-nums">
                                            {r.uniqueWallets.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 w-full">
                                        <div
                                            className="h-full transition-all duration-300"
                                            style={{
                                                width: `${String(pct)}%`,
                                                backgroundColor: isLeader ? "#D71921" : "rgba(255,255,255,0.6)",
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Raw data table */}
                    <div className="border border-white/10">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                        VARIANT
                                    </th>
                                    <th className="text-right p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                        EVENTS
                                    </th>
                                    <th className="text-right p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                        WALLETS
                                    </th>
                                    <th className="text-right p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                        EVENTS/WALLET
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r) => {
                                    const ratio =
                                        r.uniqueWallets > 0
                                            ? (r.eventCount / r.uniqueWallets).toFixed(1)
                                            : "—";
                                    return (
                                        <tr
                                            key={r.variantId}
                                            className="border-b border-white/5 last:border-0"
                                        >
                                            <td className="p-3 font-sans text-sm text-white">
                                                {r.variantName}
                                            </td>
                                            <td className="p-3 text-right font-mono text-sm text-white tabular-nums">
                                                {r.eventCount.toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right font-mono text-sm text-white tabular-nums">
                                                {r.uniqueWallets.toLocaleString()}
                                            </td>
                                            <td className="p-3 text-right font-mono text-sm text-white tabular-nums">
                                                {ratio}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tip */}
            <div className="border border-white/10 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30 mb-1">
                    HOW RESULTS ARE COLLECTED
                </p>
                <p className="text-xs text-white/40 font-sans leading-relaxed">
                    The SDK reads <code className="font-mono">_experiments</code> from the
                    remote-config response and tags subsequent analytics events with{" "}
                    <code className="font-mono">ab_experiment_id</code> and{" "}
                    <code className="font-mono">ab_variant_id</code> in event properties.
                    Assignment is deterministic — the same wallet always receives the same
                    variant for the lifetime of the experiment.
                </p>
            </div>
        </div>
    );
}
