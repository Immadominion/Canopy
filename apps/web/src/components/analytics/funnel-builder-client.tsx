"use client";

import { useState } from "react";

import type { FunnelDefinition, FunnelStep } from "@canopy/types";

interface FunnelResult {
    step_index: number;
    event_name: string;
    wallet_count: number;
}

interface FunnelBuilderClientProps {
    appId: string;
    initialFunnels: FunnelDefinition[];
}

interface CreateForm {
    name: string;
    steps: Array<{ event_name: string; label: string }>;
}

const EMPTY_STEP = { event_name: "", label: "" };

export function FunnelBuilderClient({
    appId,
    initialFunnels,
}: FunnelBuilderClientProps) {
    const [funnels, setFunnels] = useState<FunnelDefinition[]>(initialFunnels);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState<CreateForm>({
        name: "",
        steps: [{ ...EMPTY_STEP }, { ...EMPTY_STEP }],
    });
    const [activeResults, setActiveResults] = useState<{
        funnelId: string;
        results: FunnelResult[];
    } | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleCreate() {
        setError(null);
        const validSteps = form.steps.filter((s) => s.event_name.trim().length > 0);
        if (!form.name.trim()) {
            setError("Funnel name is required.");
            return;
        }
        if (validSteps.length < 2) {
            setError("At least 2 steps with event names are required.");
            return;
        }

        try {
            const res = await fetch("/api/v1/analytics/funnels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    appId,
                    name: form.name.trim(),
                    steps: validSteps.map((s) => ({
                        event_name: s.event_name.trim(),
                        ...(s.label.trim() ? { label: s.label.trim() } : {}),
                    })),
                }),
            });

            if (!res.ok) {
                const body = await res.json() as { error?: { message?: string } };
                setError(body.error?.message ?? "Failed to create funnel.");
                return;
            }

            const body = await res.json() as { funnel: FunnelDefinition };
            setFunnels((prev) => [body.funnel, ...prev]);
            setShowCreate(false);
            setForm({ name: "", steps: [{ ...EMPTY_STEP }, { ...EMPTY_STEP }] });
        } catch {
            setError("Network error. Please try again.");
        }
    }

    async function handleRunFunnel(funnelId: string) {
        setLoadingId(funnelId);
        setActiveResults(null);
        setError(null);

        try {
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const until = new Date().toISOString();
            const url = `/api/v1/analytics/funnels/${funnelId}?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`;
            const res = await fetch(url);

            if (!res.ok) {
                const body = await res.json() as { error?: { message?: string } };
                setError(body.error?.message ?? "Failed to run funnel.");
                return;
            }

            const body = await res.json() as { results: FunnelResult[] };
            setActiveResults({ funnelId, results: body.results });
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoadingId(null);
        }
    }

    async function handleDelete(funnelId: string, name: string) {
        if (!window.confirm(`Delete funnel "${name}"? This cannot be undone.`)) return;
        setError(null);

        try {
            const res = await fetch(`/api/v1/analytics/funnels/${funnelId}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                setError("Failed to delete funnel.");
                return;
            }
            setFunnels((prev) => prev.filter((f) => f.id !== funnelId));
            if (activeResults?.funnelId === funnelId) setActiveResults(null);
        } catch {
            setError("Network error. Please try again.");
        }
    }

    function addStep() {
        if (form.steps.length >= 5) return;
        setForm((prev) => ({ ...prev, steps: [...prev.steps, { ...EMPTY_STEP }] }));
    }

    function removeStep(index: number) {
        if (form.steps.length <= 2) return;
        setForm((prev) => ({
            ...prev,
            steps: prev.steps.filter((_, i) => i !== index),
        }));
    }

    function updateStep(index: number, field: "event_name" | "label", value: string) {
        setForm((prev) => ({
            ...prev,
            steps: prev.steps.map((s, i) =>
                i === index ? { ...s, [field]: value } : s,
            ),
        }));
    }

    // Find the max wallet count for bar scaling
    const maxCount =
        activeResults && activeResults.results.length > 0
            ? Math.max(...activeResults.results.map((r) => r.wallet_count))
            : 0;

    return (
        <div className="space-y-6">
            {/* ── Error banner ─────────────────────────────────────────────── */}
            {error && (
                <div className="border border-white/20 bg-white/5 p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/70">
                    {error}
                </div>
            )}

            {/* ── Create button ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                    {funnels.length === 0 ? "NO FUNNELS YET" : `${String(funnels.length)} FUNNEL${funnels.length === 1 ? "" : "S"}`}
                </p>
                {!showCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="border border-white/20 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
                    >
                        + NEW FUNNEL
                    </button>
                )}
            </div>

            {/* ── Create form ──────────────────────────────────────────────── */}
            {showCreate && (
                <div className="border border-white/20 p-6 space-y-4">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                        NEW FUNNEL
                    </p>

                    <div className="space-y-1">
                        <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                            NAME
                        </label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. Swap Completion"
                            className="w-full bg-transparent border border-white/20 px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                STEPS ({form.steps.length}/5)
                            </label>
                            {form.steps.length < 5 && (
                                <button
                                    onClick={addStep}
                                    className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
                                >
                                    + ADD STEP
                                </button>
                            )}
                        </div>

                        {form.steps.map((step, i) => (
                            <div key={i} className="flex gap-2 items-start">
                                <div className="flex-none font-mono text-xs text-white/30 pt-2.5 w-5">
                                    {i + 1}.
                                </div>
                                <input
                                    type="text"
                                    value={step.event_name}
                                    onChange={(e) => updateStep(i, "event_name", e.target.value)}
                                    placeholder="event_name"
                                    className="flex-1 bg-transparent border border-white/20 px-3 py-2 font-mono text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                                />
                                <input
                                    type="text"
                                    value={step.label}
                                    onChange={(e) => updateStep(i, "label", e.target.value)}
                                    placeholder="Label (optional)"
                                    className="flex-1 bg-transparent border border-white/20 px-3 py-2 font-mono text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                                />
                                {form.steps.length > 2 && (
                                    <button
                                        onClick={() => removeStep(i)}
                                        className="font-mono text-xs text-white/30 hover:text-white/60 pt-2"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => void handleCreate()}
                            className="border border-white/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-white hover:bg-white hover:text-black transition-colors"
                        >
                            CREATE
                        </button>
                        <button
                            onClick={() => {
                                setShowCreate(false);
                                setError(null);
                            }}
                            className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            {/* ── Funnel list ──────────────────────────────────────────────── */}
            {funnels.length === 0 && !showCreate ? (
                <div className="border border-white/10 p-8 text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                        NO FUNNELS DEFINED
                    </p>
                    <p className="mt-2 text-sm text-white/40 font-sans">
                        Create a funnel to track multi-step conversion paths.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {funnels.map((funnel) => {
                        const steps = funnel.steps as FunnelStep[];
                        const isActive = activeResults?.funnelId === funnel.id;

                        return (
                            <div key={funnel.id} className="border border-white/10 p-5 space-y-4">
                                {/* Funnel header */}
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-sans text-sm font-medium text-white">
                                            {funnel.name}
                                        </p>
                                        <p className="mt-0.5 font-mono text-xs text-white/40">
                                            {steps.length} STEPS &mdash;{" "}
                                            {steps.map((s) => s.event_name).join(" → ")}
                                        </p>
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => void handleRunFunnel(funnel.id)}
                                            disabled={loadingId === funnel.id}
                                            className="font-mono text-xs uppercase tracking-[0.08em] text-white/50 hover:text-white disabled:opacity-30 border border-white/20 px-3 py-1.5 hover:border-white/40 transition-colors"
                                        >
                                            {loadingId === funnel.id ? "RUNNING…" : "RUN"}
                                        </button>
                                        <button
                                            onClick={() => void handleDelete(funnel.id, funnel.name)}
                                            className="font-mono text-xs uppercase tracking-[0.08em] text-white/30 hover:text-white/60"
                                        >
                                            DELETE
                                        </button>
                                    </div>
                                </div>

                                {/* Results — pure CSS bar chart */}
                                {isActive && activeResults && (
                                    <div className="space-y-2 pt-2 border-t border-white/10">
                                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                            LAST 30 DAYS
                                        </p>
                                        {activeResults.results.map((result) => {
                                            const pct = maxCount > 0 ? (result.wallet_count / maxCount) * 100 : 0;
                                            const step = steps[result.step_index];
                                            const label = step?.label ?? result.event_name;

                                            return (
                                                <div key={result.step_index} className="space-y-1">
                                                    <div className="flex justify-between font-mono text-xs">
                                                        <span className="text-white/60">
                                                            {String(result.step_index + 1)}. {label}
                                                        </span>
                                                        <span className="text-white tabular-nums">
                                                            {result.wallet_count.toLocaleString()}
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
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
