"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Experiment, ExperimentVariant } from "@canopy/types";

export type ExperimentWithVariants = Experiment & {
    experiment_variants: ExperimentVariant[];
};

interface RemoteConfigOption {
    id: string;
    key: string;
}

interface ExperimentListClientProps {
    appId: string;
    initialExperiments: ExperimentWithVariants[];
    remoteConfigs: RemoteConfigOption[];
}

interface VariantForm {
    name: string;
    weight: string;
    config_value: string;
}

interface CreateForm {
    name: string;
    description: string;
    traffic_percentage: string;
    remote_config_id: string;
    variants: VariantForm[];
}

const EMPTY_VARIANT: VariantForm = { name: "", weight: "1", config_value: "" };

const STATUS_LABELS: Record<string, string> = {
    draft: "DRAFT",
    active: "ACTIVE",
    concluded: "CONCLUDED",
};

const STATUS_COLORS: Record<string, string> = {
    draft: "text-white/40",
    active: "text-white",
    concluded: "text-white/30",
};

export function ExperimentListClient({
    appId,
    initialExperiments,
    remoteConfigs,
}: ExperimentListClientProps) {
    const router = useRouter();
    const [experiments, setExperiments] =
        useState<ExperimentWithVariants[]>(initialExperiments);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState<CreateForm>({
        name: "",
        description: "",
        traffic_percentage: "50",
        remote_config_id: "",
        variants: [
            { name: "Control", weight: "1", config_value: "" },
            { name: "Treatment", weight: "1", config_value: "" },
        ],
    });
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleCreate() {
        setError(null);
        if (!form.name.trim()) {
            setError("Experiment name is required.");
            return;
        }
        const validVariants = form.variants.filter((v) => v.name.trim().length > 0);
        if (validVariants.length < 2) {
            setError("At least 2 named variants are required.");
            return;
        }
        const trafficPct = Number(form.traffic_percentage);
        if (isNaN(trafficPct) || trafficPct < 1 || trafficPct > 100) {
            setError("Traffic percentage must be between 1 and 100.");
            return;
        }

        try {
            const body: Record<string, unknown> = {
                appId,
                name: form.name.trim(),
                traffic_percentage: trafficPct,
                variants: validVariants.map((v) => ({
                    name: v.name.trim(),
                    weight: Math.max(1, Number(v.weight) || 1),
                    ...(v.config_value.trim()
                        ? { config_value: parseJsonOrString(v.config_value.trim()) }
                        : {}),
                })),
            };
            if (form.description.trim()) body["description"] = form.description.trim();
            if (form.remote_config_id) body["remote_config_id"] = form.remote_config_id;

            const res = await fetch("/api/v1/analytics/experiments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const json = await res.json() as { error?: { message?: string } };
                setError(json.error?.message ?? "Failed to create experiment.");
                return;
            }

            const json = await res.json() as { experiment: ExperimentWithVariants };
            setExperiments((prev) => [json.experiment, ...prev]);
            setShowCreate(false);
            resetForm();
        } catch {
            setError("Network error. Please try again.");
        }
    }

    async function handleStatusChange(
        experimentId: string,
        newStatus: "active" | "concluded",
    ) {
        const label = newStatus === "active" ? "activate" : "conclude";
        if (
            !window.confirm(
                `${label.charAt(0).toUpperCase() + label.slice(1)} this experiment? ${newStatus === "concluded"
                    ? "Concluded experiments cannot be reactivated."
                    : ""
                }`,
            )
        )
            return;

        setLoadingId(experimentId);
        setError(null);
        try {
            const res = await fetch(
                `/api/v1/analytics/experiments/${experimentId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: newStatus }),
                },
            );
            if (!res.ok) {
                const json = await res.json() as { error?: { message?: string } };
                setError(json.error?.message ?? "Failed to update experiment.");
                return;
            }
            const json = await res.json() as { experiment: ExperimentWithVariants };
            setExperiments((prev) =>
                prev.map((e) => (e.id === experimentId ? json.experiment : e)),
            );
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoadingId(null);
        }
    }

    async function handleDelete(experimentId: string, name: string) {
        if (
            !window.confirm(`Delete experiment "${name}"? This cannot be undone.`)
        )
            return;
        setError(null);
        try {
            const res = await fetch(
                `/api/v1/analytics/experiments/${experimentId}`,
                { method: "DELETE" },
            );
            if (!res.ok) {
                const json = await res.json() as { error?: { message?: string } };
                setError(json.error?.message ?? "Failed to delete experiment.");
                return;
            }
            setExperiments((prev) => prev.filter((e) => e.id !== experimentId));
        } catch {
            setError("Network error. Please try again.");
        }
    }

    function addVariant() {
        if (form.variants.length >= 8) return;
        setForm((prev) => ({
            ...prev,
            variants: [...prev.variants, { ...EMPTY_VARIANT }],
        }));
    }

    function removeVariant(index: number) {
        if (form.variants.length <= 2) return;
        setForm((prev) => ({
            ...prev,
            variants: prev.variants.filter((_, i) => i !== index),
        }));
    }

    function updateVariant(
        index: number,
        field: keyof VariantForm,
        value: string,
    ) {
        setForm((prev) => ({
            ...prev,
            variants: prev.variants.map((v, i) =>
                i === index ? { ...v, [field]: value } : v,
            ),
        }));
    }

    function resetForm() {
        setForm({
            name: "",
            description: "",
            traffic_percentage: "50",
            remote_config_id: "",
            variants: [
                { name: "Control", weight: "1", config_value: "" },
                { name: "Treatment", weight: "1", config_value: "" },
            ],
        });
    }

    return (
        <div className="space-y-6">
            {/* Error banner */}
            {error && (
                <div className="border border-white/20 bg-white/5 p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/70">
                    {error}
                </div>
            )}

            {/* Controls row */}
            <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                    {experiments.length === 0
                        ? "NO EXPERIMENTS YET"
                        : `${String(experiments.length)} EXPERIMENT${experiments.length === 1 ? "" : "S"}`}
                </p>
                {!showCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="border border-white/20 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
                    >
                        + NEW EXPERIMENT
                    </button>
                )}
            </div>

            {/* Create form */}
            {showCreate && (
                <div className="border border-white/20 p-6 space-y-5">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                        NEW EXPERIMENT
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 space-y-1">
                            <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                NAME
                            </label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="e.g. Onboarding CTA Test"
                                className="w-full bg-transparent border border-white/20 px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                TRAFFIC %
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={form.traffic_percentage}
                                onChange={(e) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        traffic_percentage: e.target.value,
                                    }))
                                }
                                className="w-full bg-transparent border border-white/20 px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                            />
                        </div>

                        {remoteConfigs.length > 0 && (
                            <div className="space-y-1">
                                <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                    REMOTE CONFIG KEY (OPTIONAL)
                                </label>
                                <select
                                    value={form.remote_config_id}
                                    onChange={(e) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            remote_config_id: e.target.value,
                                        }))
                                    }
                                    className="w-full bg-black border border-white/20 px-3 py-2 font-mono text-sm text-white focus:outline-none focus:border-white/40"
                                >
                                    <option value="">— none —</option>
                                    {remoteConfigs.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.key}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="col-span-2 space-y-1">
                            <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                DESCRIPTION (OPTIONAL)
                            </label>
                            <input
                                type="text"
                                value={form.description}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, description: e.target.value }))
                                }
                                placeholder="What hypothesis are you testing?"
                                className="w-full bg-transparent border border-white/20 px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                            />
                        </div>
                    </div>

                    {/* Variants */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                VARIANTS ({form.variants.length}/8)
                            </label>
                            {form.variants.length < 8 && (
                                <button
                                    onClick={addVariant}
                                    className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
                                >
                                    + ADD VARIANT
                                </button>
                            )}
                        </div>

                        {form.variants.map((variant, i) => (
                            <div key={i} className="flex gap-2 items-start">
                                <div className="flex-none font-mono text-xs text-white/30 pt-2.5 w-5">
                                    {i + 1}.
                                </div>
                                <input
                                    type="text"
                                    value={variant.name}
                                    onChange={(e) => updateVariant(i, "name", e.target.value)}
                                    placeholder="Variant name"
                                    className="flex-1 bg-transparent border border-white/20 px-3 py-2 font-mono text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                                />
                                <input
                                    type="number"
                                    min={1}
                                    value={variant.weight}
                                    onChange={(e) => updateVariant(i, "weight", e.target.value)}
                                    title="Weight"
                                    className="w-16 bg-transparent border border-white/20 px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-white/40"
                                />
                                {form.remote_config_id && (
                                    <input
                                        type="text"
                                        value={variant.config_value}
                                        onChange={(e) =>
                                            updateVariant(i, "config_value", e.target.value)
                                        }
                                        placeholder="Config value (JSON or string)"
                                        className="flex-1 bg-transparent border border-white/20 px-3 py-2 font-mono text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                                    />
                                )}
                                {form.variants.length > 2 && (
                                    <button
                                        onClick={() => removeVariant(i)}
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
                                resetForm();
                            }}
                            className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            {/* Experiment list */}
            {experiments.length === 0 && !showCreate ? (
                <div className="border border-white/10 p-8 text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                        NO EXPERIMENTS DEFINED
                    </p>
                    <p className="mt-2 text-sm text-white/40 font-sans">
                        Create an experiment to A/B test config values against wallet
                        analytics.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {experiments.map((exp) => {
                        const totalWeight = exp.experiment_variants.reduce(
                            (s, v) => s + v.weight,
                            0,
                        );

                        return (
                            <div
                                key={exp.id}
                                className="border border-white/10 p-5 space-y-3"
                            >
                                {/* Header row */}
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-sans text-sm font-medium text-white">
                                            {exp.name}
                                        </p>
                                        {exp.description && (
                                            <p className="mt-0.5 text-xs text-white/40 font-sans">
                                                {exp.description}
                                            </p>
                                        )}
                                        <div className="mt-1.5 flex items-center gap-3">
                                            <span
                                                className={`font-mono text-xs uppercase tracking-[0.08em] ${STATUS_COLORS[exp.status] ?? "text-white/40"}`}
                                            >
                                                {STATUS_LABELS[exp.status] ?? exp.status}
                                            </span>
                                            <span className="font-mono text-xs text-white/30">
                                                {String(exp.traffic_percentage)}% TRAFFIC
                                            </span>
                                            <span className="font-mono text-xs text-white/30">
                                                {String(exp.experiment_variants.length)} VARIANTS
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3 items-center">
                                        {exp.status !== "concluded" && (
                                            <button
                                                onClick={() =>
                                                    void router.push(
                                                        `/dashboard/apps/${appId}/analytics/experiments/${exp.id}`,
                                                    )
                                                }
                                                className="font-mono text-xs uppercase tracking-[0.08em] text-white/50 hover:text-white border border-white/20 px-3 py-1.5 hover:border-white/40 transition-colors"
                                            >
                                                RESULTS
                                            </button>
                                        )}
                                        {exp.status === "draft" && (
                                            <button
                                                onClick={() =>
                                                    void handleStatusChange(exp.id, "active")
                                                }
                                                disabled={loadingId === exp.id}
                                                className="font-mono text-xs uppercase tracking-[0.08em] text-white/50 hover:text-white border border-white/20 px-3 py-1.5 hover:border-white/40 transition-colors disabled:opacity-30"
                                            >
                                                {loadingId === exp.id ? "…" : "ACTIVATE"}
                                            </button>
                                        )}
                                        {exp.status === "active" && (
                                            <button
                                                onClick={() =>
                                                    void handleStatusChange(exp.id, "concluded")
                                                }
                                                disabled={loadingId === exp.id}
                                                className="font-mono text-xs uppercase tracking-[0.08em] text-white/50 hover:text-white border border-white/20 px-3 py-1.5 hover:border-white/40 transition-colors disabled:opacity-30"
                                            >
                                                {loadingId === exp.id ? "…" : "CONCLUDE"}
                                            </button>
                                        )}
                                        {exp.status === "draft" && (
                                            <button
                                                onClick={() => void handleDelete(exp.id, exp.name)}
                                                className="font-mono text-xs uppercase tracking-[0.08em] text-white/30 hover:text-white/60"
                                            >
                                                DELETE
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Variant weight pills */}
                                <div className="flex flex-wrap gap-2">
                                    {exp.experiment_variants.map((v) => {
                                        const pct =
                                            totalWeight > 0
                                                ? Math.round((v.weight / totalWeight) * 100)
                                                : 0;
                                        return (
                                            <div
                                                key={v.id}
                                                className="border border-white/10 px-2.5 py-1"
                                            >
                                                <span className="font-mono text-xs text-white/60">
                                                    {v.name}{" "}
                                                    <span className="text-white/30">
                                                        {String(pct)}%
                                                    </span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/** Parse a string as JSON; fall back to returning the raw string value. */
function parseJsonOrString(value: string): unknown {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return value;
    }
}
