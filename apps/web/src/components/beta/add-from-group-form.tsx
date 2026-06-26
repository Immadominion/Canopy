"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface GroupOption {
    id: string;
    name: string;
    memberCount: number;
}

interface AttachedGroup {
    groupId: string;
    name: string;
    membersAdded: number;
    partial: boolean;
}

interface Props {
    trackId: string;
    groups: GroupOption[];
    attached: AttachedGroup[];
    canAdd: boolean;
}

/**
 * Apply a reusable tester group to this track — client component.
 *
 * POST /api/v1/beta/[trackId]/groups materializes the group's wallets into the
 * allowlist through the 200-cap CAS (partial fill returns success-with-warning).
 * Detach (DELETE) removes provenance only; it never revokes the track's testers.
 */
export function AddFromGroupForm({ trackId, groups, attached, canAdd }: Props) {
    const router = useRouter();
    const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
    const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
    const [errorCode, setErrorCode] = useState("");
    const [result, setResult] = useState("");
    const [detaching, setDetaching] = useState("");

    async function handleApply() {
        if (!groupId || !canAdd) return;
        setStatus("submitting");
        setErrorCode("");
        setResult("");
        try {
            const res = await fetch(`/api/v1/beta/${trackId}/groups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId }),
            });
            const data = (await res.json()) as {
                error?: { code?: string };
                added?: number;
                alreadyPresent?: number;
                capReached?: boolean;
            };
            if (!res.ok) {
                setErrorCode(data.error?.code ?? "APPLY_FAILED");
                setStatus("error");
                return;
            }
            setResult(
                data.capReached
                    ? `ADDED ${String(data.added ?? 0)} — TRACK NOW FULL`
                    : `ADDED ${String(data.added ?? 0)}${
                          data.alreadyPresent ? `, ${String(data.alreadyPresent)} ALREADY ON LIST` : ""
                      }`,
            );
            setStatus("idle");
            router.refresh();
        } catch {
            setErrorCode("NETWORK_ERROR");
            setStatus("error");
        }
    }

    async function handleDetach(detachId: string) {
        setDetaching(detachId);
        try {
            await fetch(`/api/v1/beta/${trackId}/groups/${detachId}`, { method: "DELETE" });
            router.refresh();
        } finally {
            setDetaching("");
        }
    }

    const busy = status === "submitting";

    return (
        <div className="mt-nd-xl">
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-md">
                ADD FROM A TESTER GROUP
            </p>

            {groups.length === 0 ? (
                <p className="font-mono text-nd-caption text-nd-text-disabled">
                    No tester groups yet.{" "}
                    <Link
                        href="/dashboard/tester-groups"
                        className="text-nd-text-secondary hover:text-nd-text-primary transition-colors underline"
                    >
                        Create one
                    </Link>{" "}
                    to reuse testers across builds.
                </p>
            ) : !canAdd ? (
                <p className="font-mono text-nd-caption text-nd-text-disabled">
                    [ TRACK NOT ACCEPTING NEW TESTERS ]
                </p>
            ) : (
                <div className="flex flex-wrap gap-nd-md items-center">
                    <select
                        aria-label="Tester group"
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                        disabled={busy}
                        className="bg-transparent border border-nd-border focus:border-nd-border-visible outline-none font-mono text-nd-caption text-nd-text-primary px-nd-md py-nd-sm transition-colors"
                    >
                        {groups.map((g) => (
                            <option key={g.id} value={g.id} className="bg-nd-shell text-nd-text-primary">
                                {g.name} — {g.memberCount} testers
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => void handleApply()}
                        disabled={busy || !groupId}
                        className="font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-xl py-nd-sm hover:border-nd-border-visible transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {busy ? "[ APPLYING... ]" : "APPLY GROUP →"}
                    </button>
                </div>
            )}

            {status === "error" && errorCode && (
                <p className="font-mono text-nd-body text-nd-accent mt-nd-md">[ ERROR: {errorCode} ]</p>
            )}
            {result && (
                <p className="font-mono text-nd-body text-nd-text-secondary mt-nd-md">[ {result} ]</p>
            )}

            {attached.length > 0 && (
                <div className="mt-nd-lg">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                        APPLIED FROM
                    </p>
                    {attached.map((a) => (
                        <div
                            key={a.groupId}
                            className="flex items-center justify-between gap-nd-md py-nd-2xs"
                        >
                            <p className="font-mono text-nd-caption text-nd-text-secondary">
                                {a.name}
                                <span className="text-nd-text-disabled">
                                    {" "}
                                    · {a.membersAdded} added{a.partial ? " · partial" : ""}
                                </span>
                            </p>
                            <button
                                type="button"
                                onClick={() => void handleDetach(a.groupId)}
                                disabled={detaching === a.groupId}
                                className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-accent transition-colors disabled:opacity-40"
                            >
                                {detaching === a.groupId ? "..." : "DETACH"}
                            </button>
                        </div>
                    ))}
                    <p className="font-mono text-nd-caption text-nd-text-disabled mt-nd-sm">
                        Detaching removes the link only — testers already added stay on this build.
                    </p>
                </div>
            )}
        </div>
    );
}
