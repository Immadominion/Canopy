import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { OrgMemberRole, OrgActivityLog } from "@canopy/types";

import { getCurrentPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Organisation",
};

interface MemberRow {
    id: string;
    publisher_id: string | null;
    role: OrgMemberRole;
    invited_email: string | null;
    invited_at: string;
    joined_at: string | null;
}

interface PendingInvite {
    id: string;
    invited_email: string;
    role: Exclude<OrgMemberRole, "owner">;
    expires_at: string;
    accepted_at: string | null;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function roleBadgeColor(role: OrgMemberRole): string {
    switch (role) {
        case "owner":
            return "text-nd-accent";
        case "admin":
            return "text-nd-text-primary";
        case "developer":
            return "text-nd-text-secondary";
        case "viewer":
            return "text-nd-text-tertiary";
        default:
            return "text-nd-text-tertiary";
    }
}

/**
 * /dashboard/org — Organisation settings, member management, and invite flow.
 *
 * Nothing Design three-layer hierarchy:
 *   Layer 1 (Primary):   Org name + plan badge — dot-grid hero
 *   Layer 2 (Secondary): Active member list
 *   Layer 3 (Tertiary):  Pending invites section
 *
 * Accent red: one instance — owner role badge.
 */
export default async function OrgPage() {
    const publisher = await getCurrentPublisher();
    if (!publisher) notFound();

    const admin = createSupabaseAdminClient();

    // Look up the org this publisher owns.
    const { data: org } = await admin
        .from("organizations")
        .select("id, name, plan, created_at")
        .eq("owner_id", publisher.id)
        .maybeSingle();

    // Members of any org the current publisher belongs to (including owned orgs).
    let members: MemberRow[] = [];
    let pendingInvites: PendingInvite[] = [];
    let orgId: string | null = org?.id ?? null;

    // If publisher doesn't own an org, check if they're a member of one.
    if (!orgId) {
        const { data: memberRecord } = await admin
            .from("org_members")
            .select("org_id")
            .eq("publisher_id", publisher.id)
            .not("joined_at", "is", null)
            .limit(1)
            .maybeSingle();
        orgId = memberRecord?.org_id ?? null;
    }

    let recentActivity: OrgActivityLog[] = [];

    if (orgId) {
        const [membersResult, invitesResult, activityResult] = await Promise.all([
            admin
                .from("org_members")
                .select("id, publisher_id, role, invited_email, invited_at, joined_at")
                .eq("org_id", orgId)
                .order("invited_at", { ascending: true }),
            admin
                .from("org_invites")
                .select("id, invited_email, role, expires_at, accepted_at")
                .eq("org_id", orgId)
                .is("accepted_at", null)
                .gt("expires_at", new Date().toISOString())
                .order("created_at", { ascending: false }),
            admin
                .from("org_activity_log")
                .select("id, action, entity_type, entity_id, metadata, created_at, actor_id")
                .eq("org_id", orgId)
                .order("created_at", { ascending: false })
                .limit(10),
        ]);

        members = (membersResult.data as MemberRow[] | null) ?? [];
        pendingInvites = (invitesResult.data as PendingInvite[] | null) ?? [];
        recentActivity = (activityResult.data as OrgActivityLog[] | null) ?? [];
    }

    const planLabel = org?.plan?.toUpperCase() ?? "FREE";
    const isOwner = !!org;
    const activeMembers = members.filter((m) => !!m.joined_at);

    return (
        <div className="min-h-screen bg-black text-nd-text-primary">
            {/* ── dot-grid hero ──────────────────────────────────────────────────── */}
            <div
                className="relative border-b border-nd-border-subtle px-6 py-12"
                style={{
                    backgroundImage:
                        "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                }}
            >
                <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-nd-text-secondary mb-3">
                    Organisation
                </p>

                <div className="flex items-end gap-4">
                    <h1 className="font-grotesk text-3xl font-semibold text-nd-text-primary">
                        {org?.name ?? "No organisation"}
                    </h1>
                    <span className="font-mono text-[10px] tracking-[0.08em] uppercase border border-nd-border-visible px-2 py-0.5 text-nd-text-secondary mb-1">
                        {planLabel}
                    </span>
                </div>

                {!org && (
                    <p className="mt-4 font-mono text-xs text-nd-text-secondary">
                        You are a member of this organisation.
                    </p>
                )}

                {org && (
                    <p className="mt-2 font-mono text-[11px] text-nd-text-tertiary">
                        Created {formatDate(org.created_at)}
                    </p>
                )}
            </div>

            <div className="px-6 py-8 max-w-3xl space-y-10">

                {/* ── no org state ────────────────────────────────────────────────── */}
                {!orgId && (
                    <div className="border border-nd-border-subtle p-6 space-y-4">
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary">
                            No organisation yet
                        </p>
                        <p className="font-grotesk text-sm text-nd-text-secondary">
                            Create an organisation to invite team members and collaborate on your apps.
                        </p>
                        <Link
                            href="/dashboard/org/create"
                            className="inline-block font-mono text-[10px] uppercase tracking-[0.08em] border border-nd-border-visible px-4 py-2 text-nd-text-primary hover:border-nd-text-secondary transition-colors"
                        >
                            Create organisation
                        </Link>
                    </div>
                )}

                {/* ── members ─────────────────────────────────────────────────────── */}
                {activeMembers.length > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary">
                                Members &nbsp;<span className="text-nd-text-tertiary">{activeMembers.length}</span>
                            </p>
                            {isOwner && (
                                <Link
                                    href="/dashboard/org/invite"
                                    className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary hover:text-nd-text-primary transition-colors"
                                >
                                    + Invite
                                </Link>
                            )}
                        </div>

                        <div className="border border-nd-border-subtle divide-y divide-nd-border-subtle">
                            {activeMembers.map((member) => (
                                <div
                                    key={member.id}
                                    className="flex items-center justify-between px-4 py-3"
                                >
                                    <div className="space-y-0.5">
                                        <p className="font-mono text-xs text-nd-text-primary">
                                            {member.invited_email ?? member.publisher_id?.slice(0, 12) + "…"}
                                        </p>
                                        {member.joined_at && (
                                            <p className="font-mono text-[10px] text-nd-text-tertiary">
                                                Joined {formatDate(member.joined_at)}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        className={`font-mono text-[10px] uppercase tracking-[0.08em] ${roleBadgeColor(member.role)}`}
                                    >
                                        {member.role}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── pending invites ──────────────────────────────────────────────── */}
                {isOwner && pendingInvites.length > 0 && (
                    <section>
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary mb-4">
                            Pending invites &nbsp;<span className="text-nd-text-tertiary">{pendingInvites.length}</span>
                        </p>

                        <div className="border border-nd-border-subtle divide-y divide-nd-border-subtle">
                            {pendingInvites.map((invite) => (
                                <div
                                    key={invite.id}
                                    className="flex items-center justify-between px-4 py-3"
                                >
                                    <div className="space-y-0.5">
                                        <p className="font-mono text-xs text-nd-text-primary">{invite.invited_email}</p>
                                        <p className="font-mono text-[10px] text-nd-text-tertiary">
                                            Expires {formatDate(invite.expires_at)}
                                        </p>
                                    </div>
                                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-tertiary">
                                        {invite.role} · Pending
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── owner-only settings ──────────────────────────────────────────── */}
                {isOwner && (
                    <section>
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary mb-4">
                            Settings
                        </p>
                        <div className="border border-nd-border-subtle divide-y divide-nd-border-subtle">
                            <div className="flex items-center justify-between px-4 py-3">
                                <div>
                                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary">Plan</p>
                                    <p className="font-grotesk text-sm text-nd-text-primary mt-0.5">{planLabel}</p>
                                </div>
                                <Link
                                    href="/dashboard/billing"
                                    className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary hover:text-nd-text-primary transition-colors"
                                >
                                    Manage →
                                </Link>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3">
                                <div>
                                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary">API Keys</p>
                                    <p className="font-grotesk text-sm text-nd-text-secondary mt-0.5">Manage SDK and CI/CD credentials</p>
                                </div>
                                <Link
                                    href="/dashboard/settings/api-keys"
                                    className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary hover:text-nd-text-primary transition-colors"
                                >
                                    Manage →
                                </Link>
                            </div>
                        </div>
                    </section>
                )}

                {/* ── activity log ─────────────────────────────────────────────────── */}
                {recentActivity.length > 0 && (
                    <section>
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary mb-4">
                            Recent Activity
                        </p>
                        <div className="border border-nd-border-subtle divide-y divide-nd-border-subtle">
                            {recentActivity.map((event) => (
                                <div key={event.id} className="flex items-start justify-between px-4 py-3 gap-4">
                                    <div className="space-y-0.5 min-w-0">
                                        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-nd-text-primary truncate">
                                            {event.action.replace(/_/g, " ")}
                                        </p>
                                        <p className="font-mono text-[10px] text-nd-text-tertiary">
                                            {event.entity_type.toUpperCase()}
                                            {event.actor_id !== null && " · MEMBER"}
                                        </p>
                                    </div>
                                    <p className="font-mono text-[10px] text-nd-text-tertiary shrink-0">
                                        {formatDate(event.created_at)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
