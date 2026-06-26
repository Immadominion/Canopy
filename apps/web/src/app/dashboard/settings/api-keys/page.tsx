import Link from "next/link";
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

/** /dashboard/settings/api-keys — keys the SDK and CI use to send analytics + deploy. */
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

    if (!org) {
        return (
            <div className="max-w-3xl mx-auto">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    SETTINGS · API KEYS
                </p>
                <h1 className="font-body text-nd-display-md text-nd-text-display leading-tight">
                    API Keys
                </h1>
                <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-md max-w-prose leading-relaxed">
                    API keys live under an organization, and you don&apos;t have one yet. Create your
                    organization first, then come back here to make a key for your SDK.
                </p>
                <Link
                    href="/dashboard/org/create"
                    className="inline-block mt-nd-xl font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-lg py-nd-sm rounded-nd-card-compact hover:border-nd-border-visible transition-colors"
                >
                    Create organization →
                </Link>
            </div>
        );
    }

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
        <div className="max-w-3xl mx-auto">
            <header className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    SETTINGS · API KEYS
                </p>
                <h1 className="font-body text-nd-display-md text-nd-text-display leading-tight">
                    API Keys
                </h1>
                <div className="flex items-center gap-nd-md mt-nd-sm">
                    <p className="font-mono text-nd-caption text-nd-text-secondary">
                        {String(keys.length)}
                        {maxKeys !== null && (
                            <>
                                {" "}
                                <span className="text-nd-text-disabled">/</span>{" "}
                                <span className={atLimit ? "text-nd-accent" : ""}>{String(maxKeys)}</span>
                            </>
                        )}{" "}
                        ACTIVE
                    </p>
                    <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] border border-nd-border px-nd-sm py-0.5 rounded-nd-card-compact">
                        {planName} PLAN
                    </span>
                </div>
            </header>

            {atLimit && maxKeys !== null && (
                <div className="mb-nd-xl">
                    <UpgradePrompt
                        feature="API keys"
                        currentPlan={plan}
                        requiredPlan={minPlan === plan ? "pro" : minPlan}
                        currentLimit={maxKeys}
                        description="Revoke unused keys to free up slots, or upgrade for more."
                    />
                </div>
            )}

            <div className="mb-nd-xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                    ABOUT API KEYS
                </p>
                <p className="font-body text-nd-body-sm text-nd-text-secondary leading-relaxed max-w-prose">
                    API keys authenticate requests from your SDK, CI pipeline, and integrations. Each key
                    is shown once at creation and cannot be recovered, so store it safely. Revoke a
                    compromised key right away.
                </p>
            </div>

            <ApiKeysClient initialKeys={keys} plan={plan} limit={maxKeys} />
        </div>
    );
}
