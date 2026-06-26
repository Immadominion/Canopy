"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUS_LABEL: Record<string, string> = {
    open: "OPEN",
    resolved: "RESOLVED",
    archived: "ARCHIVED",
};

/**
 * Triage a feedback item: open → resolved → archived (and back).
 * PATCH /api/v1/beta/feedback/[feedbackId] with { status }.
 */
export function FeedbackStatusControl({
    feedbackId,
    status,
}: {
    feedbackId: string;
    status: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function setStatus(next: string) {
        setBusy(true);
        try {
            await fetch(`/api/v1/beta/feedback/${feedbackId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: next }),
            });
            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    const actions =
        status === "open"
            ? [
                  { label: "RESOLVE", next: "resolved" },
                  { label: "ARCHIVE", next: "archived" },
              ]
            : status === "resolved"
              ? [
                    { label: "REOPEN", next: "open" },
                    { label: "ARCHIVE", next: "archived" },
                ]
              : [{ label: "REOPEN", next: "open" }];

    return (
        <span className="inline-flex items-center gap-nd-sm">
            <span
                className={`font-mono text-nd-label uppercase tracking-[0.06em] ${
                    status === "open" ? "text-nd-text-display" : "text-nd-text-disabled"
                }`}
            >
                {STATUS_LABEL[status] ?? status.toUpperCase()}
            </span>
            {actions.map((a) => (
                <button
                    key={a.next}
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus(a.next)}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.06em] hover:text-nd-text-primary transition-colors disabled:opacity-40"
                >
                    {a.label}
                </button>
            ))}
        </span>
    );
}
