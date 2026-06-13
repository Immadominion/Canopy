import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AppSettingsForm } from "@/components/apps/app-settings-form";
import { DeleteAppDangerZone } from "@/components/apps/delete-app-danger-zone";

export const metadata: Metadata = {
    title: "App Settings",
};

interface PageProps {
    params: Promise<{ appId: string }>;
}

/**
 * /dashboard/apps/[appId]/settings — app settings hub.
 *
 * Layer 1: identity (name + package)
 * Layer 2: editable fields (name / description / dApp Store App ID) + webhooks link
 * Layer 3: danger zone (delete app + all builds)
 */
export default async function AppSettingsPage({ params }: PageProps) {
    const { appId } = await params;
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    const { data: app } = await admin
        .from("apps")
        .select("id, name, package_name, description, dapp_store_app_id")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!app) notFound();

    const { count } = await admin
        .from("beta_tracks")
        .select("id", { count: "exact", head: true })
        .eq("app_id", app.id);

    const trackCount = count ?? 0;

    return (
        <div className="max-w-3xl mx-auto">
            {/* ── Breadcrumb ── */}
            <div className="flex items-center gap-nd-sm mb-nd-xl flex-wrap">
                <Link
                    href="/dashboard/apps"
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    APPS
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <Link
                    href={`/dashboard/apps/${app.id}`}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    {app.name}
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    SETTINGS
                </span>
            </div>

            {/* ── Layer 1: header ── */}
            <div className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    APP SETTINGS
                </p>
                <p className="font-body text-nd-display-md text-nd-text-display leading-tight">
                    {app.name}
                </p>
            </div>

            {/* ── Layer 2: editable fields ── */}
            <div className="border-t border-nd-border pt-nd-xl mb-nd-2xl">
                <AppSettingsForm
                    app={{
                        id: app.id,
                        name: app.name,
                        packageName: app.package_name,
                        description: app.description,
                        dappStoreAppId: app.dapp_store_app_id,
                    }}
                />
            </div>

            {/* ── Webhooks link (existing sub-page) ── */}
            <div className="border-t border-nd-border pt-nd-xl mb-nd-2xl">
                <Link
                    href={`/dashboard/apps/${app.id}/settings/webhooks`}
                    className="group flex items-center justify-between"
                >
                    <span>
                        <span className="font-mono text-nd-label text-nd-text-primary group-hover:text-nd-text-display uppercase tracking-[0.08em] transition-colors">
                            WEBHOOKS
                        </span>
                        <span className="block mt-nd-2xs font-body text-nd-body-sm text-nd-text-secondary">
                            Outbound event delivery endpoints for this app.
                        </span>
                    </span>
                    <span className="font-mono text-nd-label text-nd-text-disabled group-hover:text-nd-text-secondary transition-colors">
                        →
                    </span>
                </Link>
            </div>

            {/* ── Layer 3: danger zone ── */}
            <div className="border-t border-nd-border pt-nd-xl">
                <DeleteAppDangerZone appId={app.id} appName={app.name} trackCount={trackCount} />
            </div>
        </div>
    );
}
