import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { RemoteConfig } from "@canopy/types";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { RemoteConfigClient } from "@/components/remote-config/remote-config-client";

interface Props {
    params: Promise<{ appId: string }>;
}

export async function generateMetadata({ params: _params }: Props): Promise<Metadata> {
    return { title: "Remote Config" };
}

/**
 * /dashboard/apps/[appId]/remote-config
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Config key count — dot-grid hero
 *   Layer 2 (Secondary): Config list with enabled/value display
 *   Layer 3 (Tertiary):  Per-row actions (toggle, rollback, delete)
 *
 * One accent red element: active config count badge.
 */
export default async function RemoteConfigPage({ params }: Props) {
    const { appId } = await params;
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    // Verify ownership
    const { data: app } = await admin
        .from("apps")
        .select("id, name")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!app) notFound();

    const { data: configs } = await admin
        .from("remote_configs")
        .select("id, key, description, base_value, conditions, enabled, created_at, updated_at")
        .eq("app_id", appId)
        .order("key");

    const allConfigs = (configs ?? []) as RemoteConfig[];
    const activeCount = allConfigs.filter((c) => c.enabled).length;

    return (
        <div className="min-h-full bg-black text-white p-8 space-y-10">
            {/* ── Layer 1: Hero ─────────────────────────────────────────────── */}
            <header className="relative overflow-hidden border border-white/10 p-8">
                {/* Dot-grid pattern — one per screen */}
                <div
                    aria-hidden
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle, white 1px, transparent 1px)",
                        backgroundSize: "24px 24px",
                    }}
                />

                <div className="relative space-y-2">
                    <p
                        style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                        className="text-[10px] text-white/40 tracking-[0.1em]"
                    >
                        {app.name.toUpperCase()} / REMOTE CONFIG
                    </p>

                    <div className="flex items-baseline gap-4">
                        <span
                            style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                            className="text-5xl text-white"
                        >
                            {allConfigs.length}
                        </span>
                        <span className="text-sm text-white/40">config keys</span>
                        {/* One accent red element per screen */}
                        {activeCount > 0 && (
                            <span
                                style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                                className="text-xs tracking-[0.08em] px-2 py-0.5 border border-[#D71921]/60 text-[#D71921]"
                            >
                                {activeCount} ACTIVE
                            </span>
                        )}
                    </div>

                    <p className="text-sm text-white/40 max-w-lg">
                        Control feature flags and app configuration at runtime — no deploy required.
                        Values are fetched and cached by the Canopy SDK.
                    </p>
                </div>
            </header>

            {/* ── Layer 2 + 3: Config list ──────────────────────────────────── */}
            <section className="space-y-4">
                <p
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className="text-[10px] text-white/40 tracking-[0.1em]"
                >
                    CONFIG KEYS
                </p>

                <RemoteConfigClient appId={appId} initialConfigs={allConfigs} />
            </section>

            {/* ── SDK usage hint ────────────────────────────────────────────── */}
            <section className="border border-white/10 p-6 space-y-3">
                <p
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className="text-[10px] text-white/40 tracking-[0.1em]"
                >
                    SDK USAGE
                </p>
                <pre
                    style={{ fontFamily: "var(--font-space-mono, monospace)" }}
                    className="text-xs text-white/60 overflow-x-auto"
                >
                    {`const isEnabled = useRemoteConfig("feature_new_ui", false);`}
                </pre>
                <p className="text-xs text-white/30">
                    Cached for 5 minutes. Stale values are served while a refresh is in
                    progress. Default value is used if the SDK cannot reach the network.
                </p>
            </section>
        </div>
    );
}
