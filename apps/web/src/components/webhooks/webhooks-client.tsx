"use client";

import { useState } from "react";

const VALID_EVENTS = [
    "install.authorised",
    "install.completed",
    "tester.added",
    "tester.removed",
    "track.created",
    "track.expired",
    "build.uploaded",
    "build.scan_passed",
    "build.scan_failed",
] as const;

type WebhookEvent = (typeof VALID_EVENTS)[number];

interface WebhookEndpoint {
    id: string;
    app_id: string;
    url: string;
    events: string[];
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

interface WebhooksClientProps {
    appId: string;
    initialEndpoints: WebhookEndpoint[];
}

interface CreateForm {
    url: string;
    events: WebhookEvent[];
}

export function WebhooksClient({ appId, initialEndpoints }: WebhooksClientProps) {
    const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>(initialEndpoints);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState<CreateForm>({ url: "", events: [] });
    const [createdSecret, setCreatedSecret] = useState<string | null>(null);
    const [createdEndpointId, setCreatedEndpointId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function toggleEvent(event: WebhookEvent) {
        setForm((prev) => ({
            ...prev,
            events: prev.events.includes(event)
                ? prev.events.filter((e) => e !== event)
                : [...prev.events, event],
        }));
    }

    async function handleCreate() {
        setError(null);
        if (!form.url.trim().startsWith("https://")) {
            setError("URL must start with https://");
            return;
        }
        if (form.events.length === 0) {
            setError("Select at least one event type.");
            return;
        }

        try {
            const res = await fetch("/api/v1/org/webhooks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appId, url: form.url.trim(), events: form.events }),
            });

            if (!res.ok) {
                const body = await res.json() as { error?: { message?: string } };
                setError(body.error?.message ?? "Failed to create webhook.");
                return;
            }

            const body = await res.json() as { endpoint: WebhookEndpoint; signing_secret: string };
            setEndpoints((prev) => [body.endpoint, ...prev]);
            setCreatedSecret(body.signing_secret);
            setCreatedEndpointId(body.endpoint.id);
            setShowCreate(false);
            setForm({ url: "", events: [] });
        } catch {
            setError("Network error. Please try again.");
        }
    }

    async function handleDelete(endpointId: string, url: string) {
        if (!window.confirm(`Delete webhook for "${url}"? This cannot be undone.`)) return;
        setError(null);

        try {
            const res = await fetch(`/api/v1/org/webhooks/${endpointId}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                setError("Failed to delete webhook.");
                return;
            }
            setEndpoints((prev) => prev.filter((e) => e.id !== endpointId));
            if (createdEndpointId === endpointId) {
                setCreatedSecret(null);
                setCreatedEndpointId(null);
            }
        } catch {
            setError("Network error. Please try again.");
        }
    }

    return (
        <div className="space-y-6">
            {/* ── One-time secret reveal ────────────────────────────────────── */}
            {createdSecret && (
                <div className="border border-white/30 p-5 space-y-2">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/70">
                        SIGNING SECRET — COPY NOW. NOT SHOWN AGAIN.
                    </p>
                    <p className="font-mono text-sm break-all text-white bg-white/5 p-3">
                        {createdSecret}
                    </p>
                    <p className="text-xs text-white/40 font-sans">
                        Use this to verify incoming webhook signatures:{" "}
                        <code className="font-mono">X-Canopy-Signature: sha256=HMAC-SHA256(secret, body)</code>
                    </p>
                    <button
                        onClick={() => {
                            setCreatedSecret(null);
                            setCreatedEndpointId(null);
                        }}
                        className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
                    >
                        DISMISS
                    </button>
                </div>
            )}

            {/* ── Error banner ─────────────────────────────────────────────── */}
            {error && (
                <div className="border border-white/20 bg-white/5 p-3 font-mono text-xs uppercase tracking-[0.08em] text-white/70">
                    {error}
                </div>
            )}

            {/* ── Create button ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                    {endpoints.length === 0
                        ? "NO ENDPOINTS"
                        : `${String(endpoints.length)} ENDPOINT${endpoints.length === 1 ? "" : "S"}`}
                </p>
                {!showCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="border border-white/20 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-white/70 hover:border-white/40 hover:text-white transition-colors"
                    >
                        + ADD ENDPOINT
                    </button>
                )}
            </div>

            {/* ── Create form ──────────────────────────────────────────────── */}
            {showCreate && (
                <div className="border border-white/20 p-6 space-y-5">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                        NEW ENDPOINT
                    </p>

                    <div className="space-y-1">
                        <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                            URL (HTTPS ONLY)
                        </label>
                        <input
                            type="url"
                            value={form.url}
                            onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                            placeholder="https://your-server.com/webhooks/canopy"
                            className="w-full bg-transparent border border-white/20 px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="font-mono text-xs uppercase tracking-[0.08em] text-white/40">
                            EVENTS
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {VALID_EVENTS.map((event) => {
                                const checked = form.events.includes(event);
                                return (
                                    <button
                                        key={event}
                                        onClick={() => toggleEvent(event)}
                                        className={`text-left border px-3 py-2 font-mono text-xs transition-colors ${checked
                                                ? "border-white/60 text-white"
                                                : "border-white/20 text-white/40 hover:border-white/40 hover:text-white/70"
                                            }`}
                                    >
                                        {event}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-1">
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

            {/* ── Endpoint list ────────────────────────────────────────────── */}
            {endpoints.length === 0 && !showCreate ? (
                <div className="border border-white/10 p-8 text-center">
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/30">
                        NO WEBHOOK ENDPOINTS
                    </p>
                    <p className="mt-2 text-sm text-white/40 font-sans">
                        Add an endpoint to receive real-time event callbacks.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {endpoints.map((endpoint) => (
                        <div key={endpoint.id} className="border border-white/10 p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="font-mono text-sm text-white truncate">{endpoint.url}</p>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {endpoint.events.map((evt) => (
                                            <span
                                                key={evt}
                                                className="font-mono text-[10px] uppercase tracking-[0.06em] text-white/40 border border-white/10 px-1.5 py-0.5"
                                            >
                                                {evt}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 flex-none">
                                    <span
                                        className={`font-mono text-xs uppercase tracking-[0.08em] ${endpoint.enabled ? "text-white/60" : "text-white/20"
                                            }`}
                                    >
                                        {endpoint.enabled ? "ACTIVE" : "DISABLED"}
                                    </span>
                                    <a
                                        href={`/api/v1/org/webhooks/${endpoint.id}/deliveries`}
                                        className="font-mono text-xs uppercase tracking-[0.08em] text-white/30 hover:text-white/60 transition-colors"
                                    >
                                        LOGS
                                    </a>
                                    <button
                                        onClick={() => void handleDelete(endpoint.id, endpoint.url)}
                                        className="font-mono text-xs uppercase tracking-[0.08em] text-white/30 hover:text-white/60 transition-colors"
                                    >
                                        DELETE
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
