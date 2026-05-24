"use client";

import { useState, useCallback, type FormEvent } from "react";

import type { RemoteConfig, RemoteConfigCondition, Json } from "@canopy/types";

// ─── Local Types ─────────────────────────────────────────────────────────────

interface CreateForm {
    key: string;
    description: string;
    base_value: string; // JSON string
    enabled: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tryParseJson(value: string): Json | null {
    try {
        return JSON.parse(value) as Json;
    } catch {
        return null;
    }
}

function formatValue(value: Json): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

const CONDITION_LABELS: Record<string, string> = {
    seeker_only: "SEEKER ONLY",
    app_version: "APP VERSION",
    percentage_rollout: "% ROLLOUT",
    on_chain_cohort: "ON-CHAIN",
};

// ─── Subcomponents ───────────────────────────────────────────────────────────

function ConditionBadge({ condition }: { condition: RemoteConfigCondition }) {
    const label = CONDITION_LABELS[condition.type] ?? condition.type.toUpperCase();
    return (
        <span
            style={{ fontFamily: "var(--font-space-mono, monospace)" }}
            className="text-[10px] tracking-[0.08em] px-1.5 py-0.5 border border-white/20 text-white/50"
        >
            {label}
        </span>
    );
}

function ConfigRow({
    config,
    onToggle,
    onDelete,
    onRollback,
}: {
    config: RemoteConfig;
    onToggle: (id: string, enabled: boolean) => void;
    onDelete: (id: string) => void;
    onRollback: (id: string) => void;
}) {
    const conditions = (config.conditions ?? []) as RemoteConfigCondition[];

    return (
        <div className="border-b border-white/10 py-4 grid grid-cols-[1fr_auto_auto] gap-4 items-start">
            {/* Key + description + conditions */}
            <div className="space-y-1 min-w-0">
                <p
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className="text-sm text-white truncate"
                >
                    {config.key}
                </p>
                {config.description && (
                    <p className="text-xs text-white/40 truncate">{config.description}</p>
                )}
                <div className="flex flex-wrap gap-1 pt-0.5">
                    {conditions.map((c, i) => (
                        <ConditionBadge key={i} condition={c} />
                    ))}
                </div>
            </div>

            {/* Current value */}
            <div className="text-right">
                <span
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className="text-xs text-white/60 max-w-[180px] truncate block"
                >
                    {formatValue(config.base_value)}
                </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
                {/* Enabled toggle */}
                <button
                    onClick={() => onToggle(config.id, !config.enabled)}
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className={`text-[10px] tracking-[0.08em] px-2 py-1 border ${config.enabled
                            ? "border-white/30 text-white/70 hover:border-white/60"
                            : "border-white/10 text-white/30 hover:border-white/30"
                        } transition-colors`}
                >
                    {config.enabled ? "ON" : "OFF"}
                </button>

                <button
                    onClick={() => onRollback(config.id)}
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className="text-[10px] tracking-[0.08em] px-2 py-1 border border-white/10 text-white/30 hover:border-white/30 hover:text-white/60 transition-colors"
                >
                    ROLLBACK
                </button>

                <button
                    onClick={() => onDelete(config.id)}
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className="text-[10px] tracking-[0.08em] px-2 py-1 border border-white/10 text-white/30 hover:border-[#D71921]/50 hover:text-[#D71921]/70 transition-colors"
                >
                    DELETE
                </button>
            </div>
        </div>
    );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function RemoteConfigClient({
    appId,
    initialConfigs,
}: {
    appId: string;
    initialConfigs: RemoteConfig[];
}) {
    const [configs, setConfigs] = useState<RemoteConfig[]>(initialConfigs);
    const [showCreate, setShowCreate] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<CreateForm>({
        key: "",
        description: "",
        base_value: "true",
        enabled: true,
    });

    const handleToggle = useCallback(async (id: string, enabled: boolean) => {
        setConfigs((prev) =>
            prev.map((c) => (c.id === id ? { ...c, enabled } : c)),
        );
        try {
            await fetch(`/api/v1/org/remote-configs/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled }),
            });
        } catch {
            // revert on error
            setConfigs((prev) =>
                prev.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c)),
            );
        }
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        const target = configs.find((c) => c.id === id);
        if (!target) return;
        if (!window.confirm(`Delete config key "${target.key}"?`)) return;

        setConfigs((prev) => prev.filter((c) => c.id !== id));
        const res = await fetch(`/api/v1/org/remote-configs/${id}`, { method: "DELETE" });
        if (!res.ok) {
            setConfigs((prev) => [...prev, target].sort((a, b) => a.key.localeCompare(b.key)));
            setError("Failed to delete config. Please try again.");
        }
    }, [configs]);

    const handleRollback = useCallback(async (id: string) => {
        const res = await fetch(`/api/v1/org/remote-configs/${id}/rollback`, { method: "POST" });
        if (!res.ok) {
            const body = await res.json() as { error?: { message?: string } };
            setError(body.error?.message ?? "Rollback failed");
            return;
        }
        const { config } = await res.json() as { config: RemoteConfig };
        setConfigs((prev) => prev.map((c) => (c.id === id ? config : c)));
    }, []);

    const handleCreate = useCallback(async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        const parsedValue = tryParseJson(form.base_value);
        if (parsedValue === null) {
            setError("Base value must be valid JSON (e.g. true, 42, \"hello\", [1,2,3])");
            return;
        }

        const res = await fetch("/api/v1/org/remote-configs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                app_id: appId,
                key: form.key.trim(),
                description: form.description.trim() || undefined,
                base_value: parsedValue,
                enabled: form.enabled,
            }),
        });

        if (!res.ok) {
            const body = await res.json() as { error?: { message?: string } };
            setError(body.error?.message ?? "Failed to create config");
            return;
        }

        const { config } = await res.json() as { config: RemoteConfig };
        setConfigs((prev) => [...prev, config].sort((a, b) => a.key.localeCompare(b.key)));
        setShowCreate(false);
        setForm({ key: "", description: "", base_value: "true", enabled: true });
    }, [appId, form]);

    return (
        <div className="space-y-6">
            {/* Error banner */}
            {error && (
                <div className="border border-[#D71921]/50 bg-[#D71921]/10 px-4 py-3">
                    <p
                        style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                        className="text-xs text-[#D71921] tracking-[0.06em]"
                    >
                        {error}
                    </p>
                </div>
            )}

            {/* Create form */}
            {showCreate ? (
                <form onSubmit={handleCreate} className="border border-white/20 p-4 space-y-4">
                    <p
                        style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                        className="text-xs text-white/50 tracking-[0.08em]"
                    >
                        NEW CONFIG KEY
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label
                                style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                                className="text-[10px] text-white/40 tracking-[0.1em] block"
                            >
                                KEY *
                            </label>
                            <input
                                required
                                value={form.key}
                                onChange={(e) => setForm({ ...form, key: e.target.value })}
                                placeholder="feature_new_ui"
                                pattern="[a-zA-Z_][a-zA-Z0-9_.]{0,98}"
                                style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm text-white focus:border-white/60 outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label
                                style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                                className="text-[10px] text-white/40 tracking-[0.1em] block"
                            >
                                BASE VALUE (JSON) *
                            </label>
                            <input
                                required
                                value={form.base_value}
                                onChange={(e) => setForm({ ...form, base_value: e.target.value })}
                                placeholder='true or "variant_a" or 42'
                                style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm text-white focus:border-white/60 outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label
                            style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                            className="text-[10px] text-white/40 tracking-[0.1em] block"
                        >
                            DESCRIPTION
                        </label>
                        <input
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="What does this config control?"
                            className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm text-white/80 focus:border-white/60 outline-none"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.enabled}
                                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                                className="accent-white w-3 h-3"
                            />
                            <span
                                style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                                className="text-[10px] text-white/50 tracking-[0.08em]"
                            >
                                ENABLED
                            </span>
                        </label>

                        <div className="ml-auto flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowCreate(false)}
                                style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                                className="text-xs tracking-[0.06em] px-3 py-2 border border-white/20 text-white/50 hover:border-white/40 transition-colors"
                            >
                                CANCEL
                            </button>
                            <button
                                type="submit"
                                style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                                className="text-xs tracking-[0.06em] px-3 py-2 bg-white text-black hover:bg-white/90 transition-colors"
                            >
                                CREATE
                            </button>
                        </div>
                    </div>
                </form>
            ) : (
                <button
                    onClick={() => setShowCreate(true)}
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className="text-xs tracking-[0.08em] px-4 py-2.5 border border-white/20 text-white/60 hover:border-white/50 hover:text-white transition-colors"
                >
                    + ADD CONFIG KEY
                </button>
            )}

            {/* Config list */}
            {configs.length === 0 ? (
                <div className="border border-white/10 px-6 py-12 text-center">
                    <p
                        style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                        className="text-xs text-white/30 tracking-[0.08em]"
                    >
                        NO CONFIG KEYS YET
                    </p>
                    <p className="text-xs text-white/20 mt-2">
                        Create your first remote config key to control app behaviour without a deploy.
                    </p>
                </div>
            ) : (
                <div>
                    {configs.map((config) => (
                        <ConfigRow
                            key={config.id}
                            config={config}
                            onToggle={handleToggle}
                            onDelete={handleDelete}
                            onRollback={handleRollback}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
