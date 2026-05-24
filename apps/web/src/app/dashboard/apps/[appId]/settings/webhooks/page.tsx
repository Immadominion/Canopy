import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { WebhooksClient } from "@/components/webhooks/webhooks-client";

interface Props {
    params: Promise<{ appId: string }>;
}

export async function generateMetadata(_props: Props): Promise<Metadata> {
    return { title: "Webhooks" };
}

/**
 * /dashboard/apps/[appId]/settings/webhooks
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Endpoint count — dot-grid hero
 *   Layer 2 (Secondary): Endpoint list with URL + enabled status
 *   Layer 3 (Tertiary):  Per-endpoint delivery log link + delete
 *
 * One accent red element: active endpoint count.
 */
export default async function WebhooksPage({ params }: Props) {
    const { appId } = await params;
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    const { data: app } = await admin
        .from("apps")
        .select("id, name")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!app) notFound();

    // Exclude signing_secret — service_role only field
    const { data: endpoints } = await admin
        .from("webhook_endpoints")
        .select("id, app_id, url, events, enabled, created_at, updated_at")
        .eq("app_id", appId)
        .order("created_at", { ascending: false });

    const allEndpoints = (endpoints ?? []) as Array<{
        id: string;
        app_id: string;
        url: string;
        events: string[];
        enabled: boolean;
        created_at: string;
        updated_at: string;
    }>;

    const activeCount = allEndpoints.filter((e) => e.enabled).length;

    return (
        <div className="min-h-screen bg-black text-white p-8 space-y-10">
            {/* ── Layer 1: Hero ─────────────────────────────────────────────── */}
            <header className="relative overflow-hidden border border-white/10 p-8">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle, white 1px, transparent 1px)",
                        backgroundSize: "16px 16px",
                    }}
                />
                <div className="relative flex items-start justify-between">
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-2">
                            {app.name}
                        </p>
                        <h1 className="font-mono text-3xl font-bold tracking-tight">
                            WEBHOOKS
                        </h1>
                        <p className="mt-2 text-sm text-white/60 font-sans">
                            Receive real-time HTTP callbacks when events occur in your app.
                            Payloads are signed with HMAC-SHA256.
                        </p>
                    </div>

                    {/* Accent red — one per screen: active endpoints */}
                    <div className="flex flex-col items-end">
                        <span className="font-mono text-xs uppercase tracking-[0.08em] text-white/40 mb-1">
                            ACTIVE
                        </span>
                        <span
                            className="font-mono text-3xl font-bold"
                            style={{ color: "#D71921" }}
                        >
                            {activeCount}
                        </span>
                    </div>
                </div>
            </header>

            {/* ── Layer 2 + 3: Endpoint management ─────────────────────────── */}
            <WebhooksClient appId={appId} initialEndpoints={allEndpoints} />
        </div>
    );
}
