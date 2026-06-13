import Link from "next/link";
import type { Metadata } from "next";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Analytics",
};

/**
 * /dashboard/analytics — analytics is per-app, so this top-level entry is an
 * app picker. Selecting an app opens its analytics dashboard.
 */
export default async function AnalyticsIndexPage() {
    const publisher = await getCurrentPublisher();

    if (!publisher || publisher.verification_status !== "approved") {
        return (
            <div className="max-w-3xl mx-auto">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    ANALYTICS
                </p>
                <p className="font-body text-nd-body text-nd-text-secondary">
                    Once your publisher access is approved and you&apos;ve created an app, its
                    analytics will appear here.
                </p>
            </div>
        );
    }

    const admin = createSupabaseAdminClient();
    const { data: apps } = await admin
        .from("apps")
        .select("id, name, package_name")
        .eq("publisher_id", publisher.id)
        .order("created_at", { ascending: false });

    const appList = apps ?? [];

    return (
        <div className="max-w-3xl mx-auto">
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-2xl">
                ANALYTICS
            </p>

            {appList.length === 0 ? (
                <p className="font-body text-nd-body text-nd-text-secondary">
                    No apps yet —{" "}
                    <Link href="/dashboard/apps" className="text-nd-text-primary underline">
                        create one
                    </Link>{" "}
                    to start tracking analytics.
                </p>
            ) : (
                <>
                    <p className="font-body text-nd-body-sm text-nd-text-secondary mb-nd-lg">
                        Select an app to view its analytics.
                    </p>
                    <div className="grid gap-nd-md">
                        {appList.map((app) => (
                            <Link
                                key={app.id}
                                href={`/dashboard/apps/${app.id}/analytics`}
                                className="group block border border-nd-border hover:border-nd-text-disabled transition-colors p-nd-lg rounded-lg"
                            >
                                <div className="flex items-baseline justify-between gap-nd-md">
                                    <span className="font-body text-nd-body text-nd-text-primary group-hover:text-nd-text-display transition-colors">
                                        {app.name}
                                    </span>
                                    <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] group-hover:text-nd-text-secondary transition-colors">
                                        VIEW →
                                    </span>
                                </div>
                                <p className="mt-nd-2xs font-mono text-nd-caption text-nd-text-secondary tracking-[0.04em]">
                                    {app.package_name}
                                </p>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
