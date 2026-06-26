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

const LABEL = "font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]";
const BTN =
    "font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-lg py-nd-sm rounded-nd-card-compact hover:border-nd-border-visible transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export function ApiKeysClient({ initialKeys, plan: _plan, limit }: ApiKeysClientProps) {
    const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
    const [isPending, startTransition] = useTransition();

    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createScopes, setCreateScopes] = useState<ApiKeyScope[]>(ALL_SCOPES);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createdKey, setCreatedKey] = useState<{ plaintext: string; name: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const [revokeError, setRevokeError] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<string | null>(null);

    const atLimit = limit !== null && keys.length >= limit;

    function toggleScope(scope: ApiKeyScope) {
        setCreateScopes((prev) =>
            prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
        );
    }

    async function copyKey() {
        if (!createdKey) return;
        try {
            await navigator.clipboard.writeText(createdKey.plaintext);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard blocked — the key is still visible to copy by hand
        }
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

            const json = (await res.json()) as { key: ApiKeyRow; plaintext_key: string };

            setKeys((prev) => [json.key, ...prev]);
            setCreatedKey({ plaintext: json.plaintext_key, name: json.key.name });
            setCopied(false);
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
        <div className="space-y-nd-xl">
            {/* One-time plaintext key */}
            {createdKey !== null && (
                <div className="border border-nd-brand rounded-nd-card p-nd-lg space-y-nd-md bg-nd-surface">
                    <p className="font-mono text-nd-label text-nd-brand-hover uppercase tracking-[0.08em]">
                        NEW KEY — COPY NOW · SHOWN ONCE
                    </p>
                    <p className="font-body text-nd-body-sm text-nd-text-secondary">
                        This is the only time{" "}
                        <span className="text-nd-text-primary font-medium">{createdKey.name}</span> is
                        shown. Store it somewhere safe. It cannot be recovered.
                    </p>
                    <div className="flex items-stretch gap-nd-sm">
                        <code className="flex-1 min-w-0 truncate font-mono text-nd-caption bg-nd-black border border-nd-border rounded-nd-card-compact px-nd-md py-nd-sm text-nd-text-primary">
                            {createdKey.plaintext}
                        </code>
                        <button
                            type="button"
                            onClick={() => void copyKey()}
                            className={`shrink-0 ${BTN} ${copied ? "border-nd-brand text-nd-brand-hover" : ""}`}
                        >
                            {copied ? "COPIED ✓" : "COPY"}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCreatedKey(null)}
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                    >
                        DISMISS
                    </button>
                </div>
            )}

            {/* Create button / form */}
            {!atLimit && !showCreate && (
                <button type="button" onClick={() => setShowCreate(true)} className={BTN}>
                    + CREATE KEY
                </button>
            )}

            {showCreate && (
                <div className="border border-nd-border rounded-nd-card p-nd-lg space-y-nd-lg">
                    <p className={LABEL}>NEW API KEY</p>

                    {createError !== null && (
                        <p className="font-mono text-nd-body text-nd-accent">[ {createError} ]</p>
                    )}

                    <div className="space-y-nd-xs">
                        <label htmlFor="key-name" className={`${LABEL} block`}>
                            NAME
                        </label>
                        <input
                            id="key-name"
                            type="text"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder="e.g. CI / CD pipeline"
                            maxLength={80}
                            className="w-full bg-transparent border border-nd-border focus:border-nd-border-visible outline-none rounded-nd-card-compact px-nd-md py-nd-sm font-mono text-nd-caption text-nd-text-primary placeholder:text-nd-text-disabled transition-colors"
                        />
                    </div>

                    <div className="space-y-nd-sm">
                        <p className={LABEL}>SCOPES</p>
                        <div className="grid grid-cols-2 gap-nd-sm sm:grid-cols-3">
                            {ALL_SCOPES.map((scope) => (
                                <label key={scope} className="flex items-center gap-nd-sm cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={createScopes.includes(scope)}
                                        onChange={() => toggleScope(scope)}
                                        className="accent-nd-brand w-3.5 h-3.5"
                                    />
                                    <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.06em] group-hover:text-nd-text-primary transition-colors">
                                        {SCOPE_LABELS[scope]}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-nd-md pt-nd-xs">
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={isPending}
                            className="font-mono text-nd-label uppercase tracking-[0.08em] bg-nd-brand text-nd-on-brand px-nd-lg py-nd-sm rounded-nd-card-compact hover:bg-nd-brand-hover disabled:opacity-50 transition-colors"
                        >
                            {isPending ? "CREATING…" : "CREATE KEY"}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowCreate(false);
                                setCreateError(null);
                            }}
                            className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            {revokeError !== null && (
                <p className="font-mono text-nd-body text-nd-accent">[ {revokeError} ]</p>
            )}

            {/* Key list */}
            {keys.length === 0 ? (
                <p className="font-body text-nd-body-sm text-nd-text-disabled">
                    No API keys yet. Create one to authenticate the SDK or your CI pipeline.
                </p>
            ) : (
                <div className="border-t border-nd-border">
                    {keys.map((key) => (
                        <div
                            key={key.id}
                            className="py-nd-md flex flex-col gap-nd-sm sm:flex-row sm:items-start sm:justify-between border-b border-nd-border"
                        >
                            <div className="space-y-nd-xs min-w-0">
                                <p className="font-body text-nd-body-sm font-medium text-nd-text-primary">
                                    {key.name}
                                </p>
                                <code className="font-mono text-nd-caption text-nd-text-secondary">
                                    {key.key_prefix}••••••••••••••••••••••••
                                </code>
                                <div className="flex flex-wrap gap-nd-xs">
                                    {key.scopes.map((scope) => (
                                        <span
                                            key={scope}
                                            className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] border border-nd-border px-nd-xs py-0.5 rounded-nd-card-compact"
                                        >
                                            {scope}
                                        </span>
                                    ))}
                                </div>
                                <p className="font-mono text-nd-label text-nd-text-disabled tracking-[0.04em]">
                                    CREATED {formatDate(key.created_at)}
                                    {key.last_used_at !== null && ` · LAST USED ${formatDate(key.last_used_at)}`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleRevoke(key.id)}
                                disabled={revoking === key.id || isPending}
                                className="shrink-0 font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em] border border-nd-border px-nd-md py-nd-sm rounded-nd-card-compact hover:border-nd-accent disabled:opacity-50 transition-colors"
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
