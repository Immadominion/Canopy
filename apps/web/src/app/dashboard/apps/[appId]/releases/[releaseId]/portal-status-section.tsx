"use client";

import { useState } from "react";

interface PortalStatusSectionProps {
    releaseId: string;
    currentStatus: string;
    submissionId: string | null;
}

type SyncStatus = "idle" | "loading" | "success" | "error";

const SYNC_TARGETS = [
    { value: "in_review", label: "IN REVIEW" },
    { value: "published", label: "PUBLISHED" },
    { value: "rejected", label: "REJECTED" },
] as const;

type SyncTarget = (typeof SYNC_TARGETS)[number]["value"];

const PORTAL_URL = "https://play.google.com/apps/publish/";

/**
 * Allows publishers to manually sync a submitted / in_review release status
 * once they have confirmed it in the dApp Store Publisher Portal.
 *
 * TODO: Replace with automated on-chain polling once the dApp Store App NFT
 * program address and state schema are confirmed.
 */
export default function PortalStatusSection({
    releaseId,
    currentStatus,
    submissionId,
}: PortalStatusSectionProps) {
    const [selected, setSelected] = useState<SyncTarget>("in_review");
    const [rejectionReason, setRejectionReason] = useState("");
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const [errorMsg, setErrorMsg] = useState("");

    const canSync = currentStatus === "submitted" || currentStatus === "in_review";

    async function handleSync() {
        setSyncStatus("loading");
        setErrorMsg("");

        try {
            const body: Record<string, string> = { status: selected };
            if (selected === "rejected" && rejectionReason.trim()) {
                body["rejection_reason"] = rejectionReason.trim();
            }

            const res = await fetch(`/api/v1/releases/${releaseId}/submission-status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = (await res.json()) as { error?: { message?: string } };
                setErrorMsg(data?.error?.message ?? "Sync failed. Please try again.");
                setSyncStatus("error");
                return;
            }

            setSyncStatus("success");
            // Hard reload to show updated status
            window.location.reload();
        } catch {
            setErrorMsg("Network error. Please try again.");
            setSyncStatus("error");
        }
    }

    return (
        <section className="mb-nd-2xl">
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                PORTAL STATUS
            </p>

            <div className="border border-nd-border">
                {/* Notice */}
                <div className="px-nd-lg py-nd-md border-b border-nd-border">
                    <p className="font-mono text-nd-label text-nd-text-secondary leading-relaxed">
                        The Solana dApp Store does not yet expose a public status API. Check the{" "}
                        <a
                            href={PORTAL_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-nd-text-primary hover:underline"
                        >
                            Publisher Portal
                        </a>
                        {submissionId ? (
                            <>
                                {" "}
                                for submission{" "}
                                <span className="font-mono text-nd-text-primary">
                                    {submissionId}
                                </span>
                            </>
                        ) : null}
                        , then use the controls below to sync the status here.
                    </p>
                </div>

                {canSync ? (
                    <div className="px-nd-lg py-nd-md space-y-nd-md">
                        {/* Status selector */}
                        <div className="flex flex-wrap gap-nd-sm">
                            {SYNC_TARGETS.map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setSelected(t.value)}
                                    className={[
                                        "font-mono text-nd-label uppercase tracking-[0.08em] px-nd-md py-nd-xs border transition-colors",
                                        selected === t.value
                                            ? "border-nd-text-primary text-nd-text-primary bg-nd-surface"
                                            : "border-nd-border text-nd-text-disabled hover:border-nd-text-secondary hover:text-nd-text-secondary",
                                    ].join(" ")}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Rejection reason (only if rejected selected) */}
                        {selected === "rejected" && (
                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Paste the rejection reason from the portal…"
                                maxLength={1000}
                                rows={3}
                                className="w-full bg-transparent border border-nd-border px-nd-md py-nd-sm font-sans text-nd-body-sm text-nd-text-secondary placeholder:text-nd-text-disabled focus:outline-none focus:border-nd-text-secondary resize-none"
                            />
                        )}

                        {/* Error */}
                        {syncStatus === "error" && (
                            <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em]">
                                {errorMsg}
                            </p>
                        )}

                        {/* Sync button */}
                        <button
                            type="button"
                            disabled={syncStatus === "loading"}
                            onClick={handleSync}
                            className="font-mono text-nd-label uppercase tracking-[0.08em] px-nd-lg py-nd-sm border border-nd-border text-nd-text-primary hover:bg-nd-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {syncStatus === "loading" ? "SYNCING…" : "SYNC STATUS"}
                        </button>
                    </div>
                ) : (
                    <div className="px-nd-lg py-nd-md">
                        <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                            {currentStatus === "published"
                                ? "LIVE IN DAPP STORE"
                                : currentStatus === "rejected"
                                    ? "SUBMISSION REJECTED — CREATE A NEW RELEASE"
                                    : "SUBMIT THIS RELEASE TO ENABLE PORTAL SYNC"}
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
