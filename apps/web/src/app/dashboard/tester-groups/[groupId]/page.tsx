import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { isValidUuid } from "@canopy/utils";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { GroupMembersForm } from "@/components/beta/group-members-form";

export const metadata: Metadata = {
    title: "Tester Group",
};

interface PageProps {
    params: Promise<{ groupId: string }>;
}

/**
 * /dashboard/tester-groups/[groupId] — group detail + member management.
 *
 * Members are SHA-256 hashes (plaintext never stored), shown as opaque hash
 * prefixes; add/remove is by wallet address.
 */
export default async function TesterGroupDetailPage({ params }: PageProps) {
    const { groupId } = await params;
    if (!isValidUuid(groupId)) notFound();

    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();
    const { data: group } = await admin
        .from("tester_groups")
        .select("id, publisher_id, name, description, member_count, created_at")
        .eq("id", groupId)
        .maybeSingle();

    if (!group || group.publisher_id !== publisher.id) notFound();

    const { data: members } = await admin
        .from("tester_group_members")
        .select("id, wallet_hash, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });

    const memberList = members ?? [];

    return (
        <div className="max-w-3xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-nd-sm mb-nd-xl flex-wrap">
                <Link
                    href="/dashboard/tester-groups"
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    TESTER GROUPS
                </Link>
                <span className="font-mono text-nd-label text-nd-text-disabled">›</span>
                <span className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em]">
                    {group.name}
                </span>
            </div>

            {/* Primary */}
            <div className="mb-nd-2xl">
                <h1 className="font-body text-nd-display-md text-nd-text-display leading-tight">
                    {group.name}
                </h1>
                {group.description && (
                    <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                        {group.description}
                    </p>
                )}
                <p className="font-mono text-nd-caption text-nd-text-secondary mt-nd-md">
                    {group.member_count} {group.member_count === 1 ? "TESTER" : "TESTERS"}
                </p>
            </div>

            {/* Member management */}
            <div className="border-t border-nd-border pt-nd-xl mb-nd-2xl">
                <GroupMembersForm groupId={group.id} />

                {memberList.length > 0 && (
                    <div className="mt-nd-xl border-t border-nd-border">
                        <div className="grid grid-cols-[1fr_auto] gap-nd-xl py-nd-sm border-b border-nd-border">
                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                                WALLET HASH
                            </span>
                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] text-right">
                                ADDED
                            </span>
                        </div>
                        {memberList.map((m) => (
                            <div
                                key={m.id}
                                className="grid grid-cols-[1fr_auto] gap-nd-xl py-nd-md border-b border-nd-border items-center"
                            >
                                <p className="font-mono text-nd-caption text-nd-text-secondary tracking-[0.04em]">
                                    {m.wallet_hash.slice(0, 16)}…
                                </p>
                                <p className="font-mono text-nd-caption text-nd-text-disabled tracking-[0.04em]">
                                    {new Date(m.created_at)
                                        .toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                        .toUpperCase()}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
