import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/beta/upload-form";

export const metadata: Metadata = {
    title: "Upload Build",
};

interface PageProps {
    params: Promise<{ appId: string }>;
}

/**
 * /dashboard/apps/[appId]/upload — APK upload page.
 *
 * RSC shell with a client-side UploadForm component (needs file input + FormData).
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   "UPLOAD BUILD" heading
 *   Layer 2 (Secondary): Form fields
 *   Layer 3 (Tertiary):  Labels, hints, error messages
 */
export default async function UploadPage({ params }: PageProps) {
    const { appId } = await params;
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();
    const { data: app, error } = await admin
        .from("apps")
        .select("id, name, package_name")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (error || !app) notFound();

    return (
        <div className="max-w-xl">
            {/* ── Breadcrumb ── */}
            <div className="flex items-center gap-nd-sm mb-nd-xl">
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
                    UPLOAD
                </span>
            </div>

            {/* ── Layer 1: Heading ── */}
            <div className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    {app.package_name}
                </p>
                <p className="font-body text-nd-display-md text-nd-text-display leading-tight">
                    Upload Build
                </p>
                <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                    APK is stored privately. Testers can only download via signed, wallet-bound URLs.
                    Track expires automatically — max 30 days.
                </p>
            </div>

            {/* ── Layer 2: Upload form ── */}
            <UploadForm appId={app.id} />
        </div>
    );
}
