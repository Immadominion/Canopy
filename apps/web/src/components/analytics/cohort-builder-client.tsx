"use client";

import { useState } from "react";

import type {
    CohortCondition,
    CohortCriteria,
    CohortDefinition,
    SkrBalanceTier,
} from "@canopy/types";

interface CohortBuilderClientProps {
    appId: string;
    initialCohorts: CohortDefinition[];
}

type ConditionDraft =
    | { type: "seeker_only" }
    | { type: "has_genesis_token" }
    | { type: "skr_balance_tier"; min_tier: SkrBalanceTier }
    | { type: "nft_collection"; collection_mint: string; min_count: number };

interface CreateForm {
    name: string;
    description: string;
    operator: "and" | "or";
    conditions: ConditionDraft[];
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
    seeker_only: "Seeker device holder",
    has_genesis_token: "Genesis Token holder",
    skr_balance_tier: "SKR balance tier",
    nft_collection: "NFT collection member",
};

const SKR_TIER_LABELS: Record<SkrBalanceTier, string> = {
    low: "Low (>0 SKR)",
    medium: "Medium (significant SKR)",
    high: "High (large SKR)",
};

function describeCondition(c: CohortCondition): string {
    if (c.type === "seeker_only") return "Is Seeker device holder";
    if (c.type === "has_genesis_token") return "Holds Seeker Genesis Token";
    if (c.type === "skr_balance_tier")
        return `SKR balance ≥ ${SKR_TIER_LABELS[c.min_tier] ?? c.min_tier}`;
    if (c.type === "nft_collection")
        return `Holds NFT from ${c.collection_mint.slice(0, 8)}…${c.collection_mint.slice(-4)}${c.min_count && c.min_count > 1 ? ` (min ${String(c.min_count)})` : ""}`;
    return "Unknown condition";
}

function describeCriteria(criteria: CohortCriteria): string {
    if (criteria.conditions.length === 0) return "No conditions";
    return criteria.conditions
        .map(describeCondition)
        .join(` ${criteria.operator.toUpperCase()} `);
}

function emptyCondition(): ConditionDraft {
    return { type: "seeker_only" };
}

export function CohortBuilderClient({
    appId,
    initialCohorts,
}: CohortBuilderClientProps) {
    const [cohorts, setCohorts] = useState<CohortDefinition[]>(initialCohorts);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState<CreateForm>({
        name: "",
        description: "",
        operator: "and",
        conditions: [emptyCondition()],
    });
    const [evaluating, setEvaluating] = useState<{
        cohortId: string;
        walletAddress: string;
        result: boolean | null;
        error: string | null;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    async function handleCreate() {
        setError(null);
        if (!form.name.trim()) {
            setError("Cohort name is required.");
            return;
        }
        if (form.conditions.length === 0) {
            setError("At least one condition is required.");
            return;
        }
        // Validate nft_collection conditions have a collection_mint
        for (const c of form.conditions) {
            if (c.type === "nft_collection" && !c.collection_mint.trim()) {
                setError("NFT collection conditions require a collection mint address.");
                return;
            }
        }

        try {
            const body: Record<string, unknown> = {
                appId,
                name: form.name.trim(),
                criteria: {
                    operator: form.operator,
                    conditions: form.conditions,
                },
            };
            if (form.description.trim()) body["description"] = form.description.trim();

            const res = await fetch("/api/v1/analytics/cohorts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const json = await res.json() as { error?: { message?: string } };
                setError(json.error?.message ?? "Failed to create cohort.");
                return;
            }

            const json = await res.json() as { cohort: CohortDefinition };
            setCohorts((prev) => [json.cohort, ...prev]);
            setShowCreate(false);
            resetForm();
        } catch {
            setError("Network error. Please try again.");
        }
    }

    async function handleDelete(cohortId: string, name: string) {
        if (!window.confirm(`Delete cohort "${name}"? This cannot be undone.`))
            return;
        setError(null);
        try {
            const res = await fetch(`/api/v1/analytics/cohorts/${cohortId}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                setError("Failed to delete cohort.");
                return;
            }
            setCohorts((prev) => prev.filter((c) => c.id !== cohortId));
            if (evaluating?.cohortId === cohortId) setEvaluating(null);
        } catch {
            setError("Network error. Please try again.");
        }
    }

    async function handleEvaluate(cohortId: string) {
        const walletAddress = evaluating?.cohortId === cohortId
            ? (evaluating.walletAddress ?? "")
            : "";
        setEvaluating({ cohortId, walletAddress, result: null, error: null });
    }

    async function submitEvaluate() {
        if (!evaluating) return;
        const { cohortId, walletAddress } = evaluating;
        if (!walletAddress.trim()) {
            setEvaluating((prev) =>
                prev ? { ...prev, error: "Wallet address is required." } : null,
            );
            return;
        }
        setLoadingId(cohortId);
        setEvaluating((prev) =>
            prev ? { ...prev, result: null, error: null } : null,
        );
        try {
            const res = await fetch(
                `/api/v1/analytics/cohorts/${cohortId}/evaluate`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ walletAddress: walletAddress.trim() }),
                },
            );
            const json = await res.json() as {
                is_member?: boolean;
                error?: { message?: string };
            };
            if (!res.ok) {
                setEvaluating((prev) =>
                    prev
                        ? {
                            ...prev,
                            error: json.error?.message ?? "Evaluation failed.",
                        }
                        : null,
                );
                return;
            }
            setEvaluating((prev) =>
                prev ? { ...prev, result: json.is_member ?? false } : null,
            );
        } catch {
            setEvaluating((prev) =>
                prev ? { ...prev, error: "Network error." } : null,
            );
        } finally {
            setLoadingId(null);
        }
    }

    function addCondition() {
        setForm((prev) => ({
            ...prev,
            conditions: [...prev.conditions, emptyCondition()],
        }));
    }

    function removeCondition(index: number) {
        setForm((prev) => ({
            ...prev,
            conditions: prev.conditions.filter((_, i) => i !== index),
        }));
    }

    function updateConditionType(index: number, type: ConditionDraft["type"]) {
        setForm((prev) => {
            const updated = prev.conditions.map((c, i) => {
                if (i !== index) return c;
                if (type === "seeker_only") return { type: "seeker_only" as const };
                if (type === "has_genesis_token")
                    return { type: "has_genesis_token" as const };
                if (type === "skr_balance_tier")
                    return { type: "skr_balance_tier" as const, min_tier: "low" as SkrBalanceTier };
                return { type: "nft_collection" as const, collection_mint: "", min_count: 1 };
            });
            return { ...prev, conditions: updated };
        });
    }

    function resetForm() {
        setForm({
            name: "",
            description: "",
            operator: "and",
            conditions: [emptyCondition()],
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
                    {cohorts.length === 0
                        ? "NO COHORTS YET"
                        : `${String(cohorts.length)} COHORT${cohorts.length === 1 ? "" : "S"}`}
                </p>
                {!showCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="border border-white/20 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
                    >
                        + NEW COHORT
                    </button>
                )}
            </div>

            {/* Create form */}
            {showCreate && (
                <div className="border border-white/20 p-6 space-y-5">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                        NEW ON-CHAIN COHORT
                    </p>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                NAME
                            </label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="e.g. Genesis Token Holders"
                                className="w-full bg-transparent border border-white/20 px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                DESCRIPTION (OPTIONAL)
                            </label>
                            <input
                                type="text"
                                value={form.description}
                                onChange={(e) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        description: e.target.value,
                                    }))
                                }
                                placeholder="Who belongs in this cohort?"
                                className="w-full bg-transparent border border-white/20 px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                            />
                        </div>

                        {/* Operator toggle */}
                        <div className="space-y-1">
                            <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                CONDITION LOGIC
                            </label>
                            <div className="flex gap-2">
                                {(["and", "or"] as const).map((op) => (
                                    <button
                                        key={op}
                                        onClick={() =>
                                            setForm((prev) => ({ ...prev, operator: op }))
                                        }
                                        className={`px-4 py-1.5 font-mono text-xs uppercase tracking-[0.08em] border transition-colors ${form.operator === op
                                                ? "border-white/60 text-white"
                                                : "border-white/20 text-white/40 hover:border-white/40 hover:text-white/70"
                                            }`}
                                    >
                                        {op === "and" ? "ALL OF (AND)" : "ANY OF (OR)"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Condition builder */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                    CONDITIONS
                                </label>
                                <button
                                    onClick={addCondition}
                                    className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
                                >
                                    + ADD CONDITION
                                </button>
                            </div>

                            {form.conditions.map((condition, i) => (
                                <div
                                    key={i}
                                    className="border border-white/10 p-3 space-y-2"
                                >
                                    <div className="flex items-center gap-2">
                                        {i > 0 && (
                                            <span className="font-mono text-xs uppercase tracking-[0.08em] text-white/30 w-8">
                                                {form.operator.toUpperCase()}
                                            </span>
                                        )}
                                        <select
                                            value={condition.type}
                                            onChange={(e) =>
                                                updateConditionType(
                                                    i,
                                                    e.target.value as ConditionDraft["type"],
                                                )
                                            }
                                            className="flex-1 bg-black border border-white/20 px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-white/40"
                                        >
                                            <option value="seeker_only">
                                                {CONDITION_TYPE_LABELS["seeker_only"]}
                                            </option>
                                            <option value="has_genesis_token">
                                                {CONDITION_TYPE_LABELS["has_genesis_token"]}
                                            </option>
                                            <option value="skr_balance_tier">
                                                {CONDITION_TYPE_LABELS["skr_balance_tier"]}
                                            </option>
                                            <option value="nft_collection">
                                                {CONDITION_TYPE_LABELS["nft_collection"]}
                                            </option>
                                        </select>
                                        {form.conditions.length > 1 && (
                                            <button
                                                onClick={() => removeCondition(i)}
                                                className="font-mono text-xs text-white/30 hover:text-white/60"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>

                                    {/* Type-specific sub-fields */}
                                    {condition.type === "skr_balance_tier" && (
                                        <select
                                            value={condition.min_tier}
                                            onChange={(e) =>
                                                setForm((prev) => ({
                                                    ...prev,
                                                    conditions: prev.conditions.map((c, idx) =>
                                                        idx === i
                                                            ? {
                                                                type: "skr_balance_tier" as const,
                                                                min_tier: e.target.value as SkrBalanceTier,
                                                            }
                                                            : c,
                                                    ),
                                                }))
                                            }
                                            className="w-full bg-black border border-white/20 px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-white/40"
                                        >
                                            {(["low", "medium", "high"] as SkrBalanceTier[]).map(
                                                (tier) => (
                                                    <option key={tier} value={tier}>
                                                        {SKR_TIER_LABELS[tier]}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    )}

                                    {condition.type === "nft_collection" && (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={condition.collection_mint}
                                                onChange={(e) =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        conditions: prev.conditions.map((c, idx) =>
                                                            idx === i
                                                                ? {
                                                                    type: "nft_collection" as const,
                                                                    collection_mint: e.target.value,
                                                                    min_count: condition.min_count,
                                                                }
                                                                : c,
                                                        ),
                                                    }))
                                                }
                                                placeholder="Collection mint address (base58)"
                                                className="flex-1 bg-transparent border border-white/20 px-3 py-1.5 font-mono text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                                            />
                                            <input
                                                type="number"
                                                min={1}
                                                value={condition.min_count}
                                                onChange={(e) =>
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        conditions: prev.conditions.map((c, idx) =>
                                                            idx === i
                                                                ? {
                                                                    type: "nft_collection" as const,
                                                                    collection_mint: condition.collection_mint,
                                                                    min_count: Math.max(
                                                                        1,
                                                                        Number(e.target.value) || 1,
                                                                    ),
                                                                }
                                                                : c,
                                                        ),
                                                    }))
                                                }
                                                title="Min count"
                                                className="w-16 bg-transparent border border-white/20 px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-white/40"
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => void handleCreate()}
                            className="border border-white/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-white hover:bg-white hover:text-black transition-colors"
                        >
                            CREATE COHORT
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

            {/* Cohort list */}
            {cohorts.length === 0 && !showCreate ? (
                <div className="border border-white/10 p-8 text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                        NO COHORTS DEFINED
                    </p>
                    <p className="mt-2 text-sm text-white/40 font-sans">
                        Define wallet cohorts by on-chain holding criteria — Seeker device,
                        Genesis Token, SKR balance, or custom NFT collections.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {cohorts.map((cohort) => {
                        const criteria = cohort.criteria as CohortCriteria;
                        const isEvaluating = evaluating?.cohortId === cohort.id;

                        return (
                            <div
                                key={cohort.id}
                                className="border border-white/10 p-5 space-y-3"
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-sans text-sm font-medium text-white">
                                            {cohort.name}
                                        </p>
                                        {cohort.description && (
                                            <p className="mt-0.5 text-xs text-white/40 font-sans">
                                                {cohort.description}
                                            </p>
                                        )}
                                        <p className="mt-1.5 font-mono text-xs text-white/30 max-w-prose">
                                            {describeCriteria(criteria)}
                                        </p>
                                    </div>

                                    <div className="flex gap-3 items-center">
                                        <button
                                            onClick={() => void handleEvaluate(cohort.id)}
                                            className="font-mono text-xs uppercase tracking-[0.08em] text-white/50 hover:text-white border border-white/20 px-3 py-1.5 hover:border-white/40 transition-colors"
                                        >
                                            EVALUATE
                                        </button>
                                        <button
                                            onClick={() => void handleDelete(cohort.id, cohort.name)}
                                            className="font-mono text-xs uppercase tracking-[0.08em] text-white/30 hover:text-white/60"
                                        >
                                            DELETE
                                        </button>
                                    </div>
                                </div>

                                {/* Condition pills */}
                                <div className="flex flex-wrap gap-2">
                                    {criteria.conditions.map((c, idx) => (
                                        <div
                                            key={idx}
                                            className="border border-white/10 px-2.5 py-1"
                                        >
                                            <span className="font-mono text-xs text-white/50">
                                                {describeCondition(c)}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="border border-white/10 px-2.5 py-1">
                                        <span className="font-mono text-xs text-white/30 uppercase">
                                            {criteria.operator}
                                        </span>
                                    </div>
                                </div>

                                {/* Evaluate panel */}
                                {isEvaluating && (
                                    <div className="border-t border-white/10 pt-3 space-y-3">
                                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                                            CHECK WALLET MEMBERSHIP
                                        </p>
                                        <p className="text-xs text-white/30 font-sans">
                                            Wallet address is used only for this server-side check and
                                            is never stored.
                                        </p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={evaluating.walletAddress}
                                                onChange={(e) =>
                                                    setEvaluating((prev) =>
                                                        prev
                                                            ? { ...prev, walletAddress: e.target.value }
                                                            : null,
                                                    )
                                                }
                                                placeholder="Wallet address (base58)"
                                                className="flex-1 bg-transparent border border-white/20 px-3 py-2 font-mono text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                                            />
                                            <button
                                                onClick={() => void submitEvaluate()}
                                                disabled={loadingId === cohort.id}
                                                className="border border-white/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-white hover:bg-white hover:text-black transition-colors disabled:opacity-30"
                                            >
                                                {loadingId === cohort.id ? "…" : "CHECK"}
                                            </button>
                                            <button
                                                onClick={() => setEvaluating(null)}
                                                className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 hover:text-white/70 px-2"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        {evaluating.error && (
                                            <p className="font-mono text-xs text-white/60">
                                                {evaluating.error}
                                            </p>
                                        )}
                                        {evaluating.result !== null && (
                                            <p className="font-mono text-xs uppercase tracking-[0.08em]">
                                                RESULT:{" "}
                                                <span
                                                    style={{
                                                        color: evaluating.result ? "#D71921" : undefined,
                                                    }}
                                                    className={
                                                        evaluating.result ? "" : "text-white/40"
                                                    }
                                                >
                                                    {evaluating.result ? "IN COHORT" : "NOT IN COHORT"}
                                                </span>
                                            </p>
                                        )}
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
