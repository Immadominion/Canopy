"use client";

import { useState, useTransition } from "react";

import type { ApiKeyScope } from "@canopy/types";

interface ApiKeyRow {
    id: string;
    key_prefix: string;
    name: string;
    scopes: ApiKeyScope[];
    last_used_at: string | null;
    created_at: string;
}

interface ApiKeysClientProps {
    initialKeys: ApiKeyRow[];
    plan: "free" | "pro" | "enterprise";
    limit: number | null; // null = unlimited
}

const ALL_SCOPES: ApiKeyScope[] = [
    "beta:read",
    "beta:write",
    "analytics:read",
    "events:write",
    "crashes:write",
    "releases:write",
];

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
    "beta:read": "Beta · Read",
    "beta:write": "Beta · Write",
    "analytics:read": "Analytics · Read",
    "events:write": "Events · Write",
    "crashes:write": "Crashes · Write",
    "releases:write": "Releases · Write",
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function ApiKeysClient({ initialKeys, plan: _plan, limit }: ApiKeysClientProps) {
    const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
    const [isPending, startTransition] = useTransition();

    // Create form state
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createScopes, setCreateScopes] = useState<ApiKeyScope[]>(ALL_SCOPES);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createdKey, setCreatedKey] = useState<{ plaintext: string; name: string } | null>(null);

    // Revoke state
    const [revokeError, setRevokeError] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<string | null>(null);

    const atLimit = limit !== null && keys.length >= limit;

    function toggleScope(scope: ApiKeyScope) {
        setCreateScopes((prev) =>
            prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
        );
    }

    function handleCreate() {
        if (!createName.trim()) {
            setCreateError("Key name is required.");
            return;
        }
        if (createScopes.length === 0) {
            setCreateError("Select at least one scope.");
            return;
        }
        setCreateError(null);

        startTransition(async () => {
            const res = await fetch("/api/v1/org/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: createName.trim(), scopes: createScopes }),
            });

            if (!res.ok) {
                const json = (await res.json()) as { error?: { message?: string } };
                setCreateError(json.error?.message ?? "Failed to create key.");
                return;
            }

            const json = (await res.json()) as {
                key: ApiKeyRow;
                plaintext_key: string;
            };

            setKeys((prev) => [json.key, ...prev]);
            setCreatedKey({ plaintext: json.plaintext_key, name: json.key.name });
            setCreateName("");
            setCreateScopes(ALL_SCOPES);
            setShowCreate(false);
        });
    }

    function handleRevoke(keyId: string) {
        setRevokeError(null);
        setRevoking(keyId);

        startTransition(async () => {
            const res = await fetch(`/api/v1/org/api-keys/${keyId}`, { method: "DELETE" });

            setRevoking(null);

            if (!res.ok) {
                const json = (await res.json()) as { error?: { message?: string } };
                setRevokeError(json.error?.message ?? "Failed to revoke key.");
                return;
            }

            setKeys((prev) => prev.filter((k) => k.id !== keyId));
        });
    }

    return (
        <div className="space-y-6">
            {/* ── One-time plaintext key display ─────────────────────────────── */}
            {createdKey !== null && (
                <div className="border border-[var(--border)] rounded-sm p-4 space-y-2 bg-[#0a0a0a]">
                    <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-secondary)]">
                        NEW KEY — COPY NOW · SHOWN ONCE
                    </p>
                    <p className="font-sans text-sm text-[var(--text-secondary)]">
                        This is the only time <span className="font-semibold">{createdKey.name}</span> will be shown.
                        Store it somewhere safe — it cannot be recovered.
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono text-xs bg-[#111] border border-[var(--border)] rounded-sm px-3 py-2 text-[var(--text-primary)] overflow-x-auto">
                            {createdKey.plaintext}
                        </code>
                        <button
                            type="button"
                            onClick={() => { void navigator.clipboard.writeText(createdKey.plaintext); }}
                            className="font-mono text-[10px] tracking-[0.08em] uppercase border border-[var(--border)] px-2.5 py-2 rounded-sm hover:bg-[var(--surface-hover)] transition-colors"
                        >
                            COPY
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCreatedKey(null)}
                        className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                    >
                        DISMISS
                    </button>
                </div>
            )}

            {/* ── Create button / form ─────────────────────────────────────────── */}
            {!atLimit && !showCreate && (
                <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="font-mono text-[11px] tracking-[0.08em] uppercase border border-[var(--border)] px-3 py-2 rounded-sm hover:bg-[var(--surface-hover)] transition-colors"
                >
                    + CREATE KEY
                </button>
            )}

            {showCreate && (
                <div className="border border-[var(--border)] rounded-sm p-4 space-y-4">
                    <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-secondary)]">
                        NEW API KEY
                    </p>

                    {createError !== null && (
                        <p className="font-sans text-sm text-[#D71921]">{createError}</p>
                    )}

                    <div className="space-y-1">
                        <label
                            htmlFor="key-name"
                            className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-secondary)]"
                        >
                            NAME
                        </label>
                        <input
                            id="key-name"
                            type="text"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder="e.g. CI / CD pipeline"
                            className="w-full bg-[#111] border border-[var(--border)] rounded-sm px-3 py-2 font-sans text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-secondary)]"
                            maxLength={80}
                        />
                    </div>

                    <div className="space-y-2">
                        <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-secondary)]">
                            SCOPES
                        </p>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                            {ALL_SCOPES.map((scope) => (
                                <label
                                    key={scope}
                                    className="flex items-center gap-2 cursor-pointer group"
                                >
                                    <input
                                        type="checkbox"
                                        checked={createScopes.includes(scope)}
                                        onChange={() => toggleScope(scope)}
                                        className="accent-[var(--text-primary)] w-3.5 h-3.5"
                                    />
                                    <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                                        {SCOPE_LABELS[scope]}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={isPending}
                            className="font-mono text-[11px] tracking-[0.08em] uppercase bg-[var(--text-primary)] text-[#000000] px-3 py-2 rounded-sm hover:bg-[var(--text-secondary)] disabled:opacity-50 transition-colors"
                        >
                            {isPending ? "CREATING…" : "CREATE KEY"}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowCreate(false); setCreateError(null); }}
                            className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            {/* ── Error from revoke ─────────────────────────────────────────────── */}
            {revokeError !== null && (
                <p className="font-sans text-sm text-[#D71921]">{revokeError}</p>
            )}

            {/* ── Key list ──────────────────────────────────────────────────────── */}
            {keys.length === 0 ? (
                <p className="font-sans text-sm text-[var(--text-tertiary)]">
                    No API keys yet. Create one to authenticate the SDK or CI/CD pipeline.
                </p>
            ) : (
                <div className="divide-y divide-[var(--border)]">
                    {keys.map((key) => (
                        <div key={key.id} className="py-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1.5">
                                <p className="font-sans text-sm font-medium text-[var(--text-primary)]">{key.name}</p>
                                <code className="font-mono text-[11px] text-[var(--text-secondary)]">
                                    {key.key_prefix}••••••••••••••••••••••••••••••••
                                </code>
                                <div className="flex flex-wrap gap-1">
                                    {key.scopes.map((scope) => (
                                        <span
                                            key={scope}
                                            className="font-mono text-[9px] tracking-[0.06em] uppercase text-[var(--text-tertiary)] border border-[var(--border)] px-1.5 py-0.5 rounded-sm"
                                        >
                                            {scope}
                                        </span>
                                    ))}
                                </div>
                                <p className="font-mono text-[10px] tracking-[0.04em] text-[var(--text-tertiary)]">
                                    CREATED {formatDate(key.created_at)}
                                    {key.last_used_at !== null && ` · LAST USED ${formatDate(key.last_used_at)}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleRevoke(key.id)}
                                disabled={revoking === key.id || isPending}
                                className="shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase text-[#D71921] border border-[#D71921]/30 px-2.5 py-1.5 rounded-sm hover:bg-[#D71921]/5 disabled:opacity-50 transition-colors"
                            >
                                {revoking === key.id ? "REVOKING…" : "REVOKE"}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
