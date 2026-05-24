"use client";

import { useState } from "react";

interface RetentionRow {
    day_offset: number;
    wallet_count: number;
}

interface RetentionClientProps {
    appId: string;
    initialRetention: RetentionRow[];
}

function retentionPct(dayN: number, day0: number): number {
    if (day0 === 0) return 0;
    return Math.round((dayN / day0) * 100);
}

function pctToOpacity(pct: number): number {
    // Map 0-100% to 0.05-0.95 opacity for the cell fill
    return 0.05 + (pct / 100) * 0.9;
}

export function RetentionClient({ appId, initialRetention }: RetentionClientProps) {
    const [retention, setRetention] = useState<RetentionRow[]>(initialRetention);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const day0Count = retention.find((r) => r.day_offset === 0)?.wallet_count ?? 0;

    async function handleRefresh() {
        setLoading(true);
        setError(null);

        try {
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = new Date().toISOString();
            const url = `/api/v1/analytics/${appId}/retention?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&maxDays=30`;
            const res = await fetch(url);

            if (!res.ok) {
                setError("Failed to refresh retention data.");
                return;
            }

            const body = await res.json() as { retention: RetentionRow[] };
            setRetention(body.retention);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    const maxDay = retention.length > 0
        ? Math.max(...retention.map((r) => r.day_offset))
        : 0;

    // Build a full array 0..maxDay (fill gaps with 0)
    const rowMap = new Map(retention.map((r) => [r.day_offset, r.wallet_count]));
    const rows: RetentionRow[] = Array.from({ length: maxDay + 1 }, (_, i) => ({
        day_offset: i,
        wallet_count: rowMap.get(i) ?? 0,
    }));

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                    LAST 30 DAYS — DAY-N RETENTION
                </p>
                <button
                    onClick={() => void handleRefresh()}
                    disabled={loading}
                    className="border border-white/20 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-white/50 hover:border-white/40 hover:text-white disabled:opacity-30 transition-colors"
                >
                    {loading ? "REFRESHING…" : "REFRESH"}
                </button>
            </div>

            {error && (
                <div className="border border-white/20 bg-white/5 p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/70">
                    {error}
                </div>
            )}

            {rows.length === 0 ? (
                <div className="border border-white/10 p-8 text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                        NO DATA YET
                    </p>
                    <p className="mt-2 text-sm text-white/40 font-sans">
                        Retention data appears once your app has analytics events.
                    </p>
                </div>
            ) : (
                /* ── Retention grid — pure CSS ──────────────────────────────── */
                <div className="border border-white/10 overflow-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                <th className="text-left p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/40 border-b border-white/10 whitespace-nowrap">
                                    DAY
                                </th>
                                <th className="text-right p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/40 border-b border-white/10 whitespace-nowrap">
                                    WALLETS
                                </th>
                                <th className="text-right p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/40 border-b border-white/10 whitespace-nowrap">
                                    RETENTION
                                </th>
                                <th className="p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/40 border-b border-white/10 w-full">
                                    &nbsp;
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const pct = retentionPct(row.wallet_count, day0Count);
                                const opacity = pctToOpacity(pct);

                                return (
                                    <tr
                                        key={row.day_offset}
                                        className="border-b border-white/5 last:border-0"
                                    >
                                        <td className="p-3 font-mono text-xs text-white/50 whitespace-nowrap">
                                            DAY {row.day_offset}
                                        </td>
                                        <td className="p-3 font-mono text-sm text-right tabular-nums text-white">
                                            {row.wallet_count.toLocaleString()}
                                        </td>
                                        <td className="p-3 font-mono text-sm text-right tabular-nums text-white whitespace-nowrap">
                                            {pct}%
                                        </td>
                                        <td className="p-3">
                                            {/* CSS bar — width proportional to retention % */}
                                            <div className="h-4 w-full">
                                                <div
                                                    className="h-full transition-all duration-300"
                                                    style={{
                                                        width: `${String(pct)}%`,
                                                        backgroundColor: `rgba(255, 255, 255, ${String(opacity)})`,
                                                    }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Export link */}
            <div className="flex justify-end">
                <a
                    href={`/api/v1/analytics/${appId}/export?since=${encodeURIComponent(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())}&until=${encodeURIComponent(new Date().toISOString())}`}
                    className="font-mono text-xs uppercase tracking-[0.08em] text-white/30 hover:text-white/60 transition-colors"
                    download
                >
                    EXPORT CSV →
                </a>
            </div>
        </div>
    );
}
