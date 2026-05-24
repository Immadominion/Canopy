import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type React from "react";

import type { ApiKeyScope } from "@canopy/types";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PLAN_LIMITS, PLAN_DISPLAY_NAMES, requiredPlan } from "@/lib/billing/enforce";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { ApiKeysClient } from "@/components/api-keys/api-keys-client";

export const metadata: Metadata = {
    title: "API Keys",
};

interface ApiKeyRow {
    id: string;
    key_prefix: string;
    name: string;
    scopes: ApiKeyScope[];
    last_used_at: string | null;
    created_at: string;
}

/**
 * /dashboard/settings/api-keys
 *
 * Nothing Design three-layer hierarchy:
 *  · Primary  — hero: key count vs limit + plan badge
 *  · Secondary — key list with prefix, name, scopes, usage timestamps
 *  · Tertiary  — create / revoke actions
 *
 * One dot-grid hero. One accent red (limit badge only). No shadows.
 */
export default async function ApiKeysPage(): Promise<React.ReactElement> {
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    const { data: org, error: orgError } = await admin
        .from("organizations")
        .select("id, plan")
        .eq("owner_id", publisher.id)
        .maybeSingle();

    if (orgError) {
        console.error("[api-keys page] org error", orgError);
        notFound();
    }
    if (!org) notFound();

    const plan = (org.plan as "free" | "pro" | "enterprise") ?? "free";
    const limits = PLAN_LIMITS[plan];
    const maxKeys = limits.maxApiKeys === -1 ? null : limits.maxApiKeys;

    const { data: rawKeys, error: keysError } = await admin
        .from("api_keys")
        .select("id, key_prefix, name, scopes, last_used_at, created_at")
        .eq("org_id", org.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });

    if (keysError) {
        console.error("[api-keys page] keys error", keysError);
        notFound();
    }

    const keys: ApiKeyRow[] = (rawKeys ?? []).map((k) => ({
        id: k.id,
        key_prefix: k.key_prefix,
        name: k.name,
        scopes: (k.scopes ?? []) as ApiKeyScope[],
        last_used_at: k.last_used_at ?? null,
        created_at: k.created_at,
    }));

    const atLimit = maxKeys !== null && keys.length >= maxKeys;
    const planName = PLAN_DISPLAY_NAMES[plan];
    const minPlan = requiredPlan("maxApiKeys");

    return (
        <main className="min-h-screen bg-[#000000] text-[var(--text-primary)]">
            {/* ── Hero ─────────────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden border-b border-[var(--border)] px-6 py-12">
                {/* Dot-grid — ONE per page */}
                <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                        backgroundSize: "24px 24px",
                    }}
                />

                <div className="relative max-w-3xl">
                    {/* Tertiary label */}
                    <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-3">
                        SETTINGS · API KEYS
                    </p>

                    {/* Primary — page title */}
                    <h1 className="font-display text-3xl font-bold tracking-tight mb-4">API Keys</h1>

                    {/* Secondary — count + plan */}
                    <div className="flex items-center gap-4">
                        <p className="font-mono text-[11px] tracking-[0.08em] text-[var(--text-secondary)]">
                            {keys.length.toString()}
                            {maxKeys !== null && (
                                <>
                                    {" "}
                                    <span className="text-[var(--text-tertiary)]">/</span>{" "}
                                    <span className={atLimit ? "text-[#D71921]" : ""}>{maxKeys.toString()}</span>
                                </>
                            )}{" "}
                            ACTIVE
                        </p>
                        <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-[var(--text-tertiary)] border border-[var(--border)] px-1.5 py-0.5 rounded-sm">
                            {planName} plan
                        </span>
                    </div>
                </div>
            </section>

            {/* ── Body ─────────────────────────────────────────────────────────── */}
            <section className="max-w-3xl mx-auto px-6 py-10 space-y-8">
                {/* Upgrade prompt if at limit */}
                {atLimit && maxKeys !== null && (
                    <UpgradePrompt
                        feature="API keys"
                        currentPlan={plan}
                        requiredPlan={minPlan === plan ? "pro" : minPlan}
                        currentLimit={maxKeys}
                        description="Revoke unused keys to free up slots, or upgrade for more."
                    />
                )}

                {/* Description */}
                <div className="space-y-1">
                    <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-secondary)]">
                        ABOUT API KEYS
                    </p>
                    <p className="font-sans text-sm text-[var(--text-secondary)] leading-relaxed max-w-prose">
                        API keys authenticate requests from your SDK, CI/CD pipeline, and integrations.
                        Each key is shown once at creation and cannot be recovered — store it securely.
                        Revoke compromised keys immediately.
                    </p>
                </div>

                {/* Interactive key list + create form */}
                <ApiKeysClient initialKeys={keys} plan={plan} limit={maxKeys} />
            </section>
        </main>
    );
}
