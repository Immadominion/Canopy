import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CreateGroupForm } from "@/components/beta/create-group-form";

export const metadata: Metadata = {
    title: "Tester Groups",
};

/**
 * /dashboard/tester-groups — reusable tester lists.
 *
 * A named set of tester wallets defined once and attached to any build, so a
 * publisher never re-enters the same wallets per track. Publisher-scoped:
 * reusable across all of this publisher's apps.
 */
export default async function TesterGroupsPage() {
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();
    const { data: groups } = await admin
        .from("tester_groups")
        .select("id, name, description, member_count, updated_at")
        .eq("publisher_id", publisher.id)
        .order("updated_at", { ascending: false });

    const list = groups ?? [];

    return (
        <div className="max-w-3xl mx-auto">
            <header className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    TESTER GROUPS
                </p>
                <h1 className="font-body text-nd-display-md text-nd-text-display leading-tight">
                    Reusable tester lists
                </h1>
                <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm max-w-lg">
                    Define a set of tester wallets once, then attach it to any build — no re-entering
                    addresses. Reusable across all your apps.
                </p>
            </header>

            <CreateGroupForm />

            <div className="border-t border-nd-border pt-nd-xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    YOUR GROUPS ({list.length})
                </p>

                {list.length === 0 ? (
                    <p className="font-mono text-nd-caption text-nd-text-disabled">
                        [ NO GROUPS YET — CREATE ONE ABOVE ]
                    </p>
                ) : (
                    <div className="border-t border-nd-border">
                        {list.map((g) => (
                            <Link
                                key={g.id}
                                href={`/dashboard/tester-groups/${g.id}`}
                                className="grid grid-cols-[1fr_auto] gap-nd-xl py-nd-md border-b border-nd-border items-center group"
                            >
                                <div className="min-w-0">
                                    <p className="font-body text-nd-body text-nd-text-primary group-hover:text-nd-brand-hover transition-colors truncate">
                                        {g.name}
                                    </p>
                                    {g.description && (
                                        <p className="font-mono text-nd-caption text-nd-text-disabled truncate mt-nd-2xs">
                                            {g.description}
                                        </p>
                                    )}
                                </div>
                                <p className="font-mono text-nd-caption text-nd-text-secondary text-right">
                                    {g.member_count} {g.member_count === 1 ? "TESTER" : "TESTERS"}
                                </p>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
