"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
    trackId: string;
    currentStatus: string;
}

/**
 * Track status controls — activate or revoke a beta track.
 *
 * Activation is only allowed when status is `scan_passed` (malware scan clean).
 * The `scan_in_progress` and `scan_failed` states block activation.
 * Revocation is allowed from `scan_passed` or `active`.
 */
export function TrackStatusControls({ trackId, currentStatus }: Props) {
    const router = useRouter();
    const [pending, setPending] = useState<"activate" | "revoke" | null>(null);
    const [errorCode, setErrorCode] = useState("");

    async function updateStatus(newStatus: "active" | "revoked") {
        setPending(newStatus === "active" ? "activate" : "revoke");
        setErrorCode("");

        try {
            const res = await fetch(`/api/v1/beta/${trackId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!res.ok) {
                const data = (await res.json()) as { error?: { code?: string } };
                setErrorCode(data.error?.code ?? "UPDATE_FAILED");
                setPending(null);
                return;
            }

            router.refresh();
            setPending(null);
        } catch {
            setErrorCode("NETWORK_ERROR");
            setPending(null);
        }
    }

    if (currentStatus === "expired" || currentStatus === "revoked" || currentStatus === "scan_failed") {
        return null;
    }

    // Show scan-in-progress indicator while scan is running
    if (currentStatus === "pending_scan" || currentStatus === "scan_in_progress") {
        return (
            <div>
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                    [ SCANNING... ]
                </p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-nd-xl">
                {currentStatus === "scan_passed" && (
                    <button
                        onClick={() => void updateStatus("active")}
                        disabled={pending !== null}
                        className="font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-xl py-nd-sm hover:border-nd-border-visible transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {pending === "activate" ? "[ ACTIVATING... ]" : "ACTIVATE TRACK →"}
                    </button>
                )}

                {(currentStatus === "scan_passed" || currentStatus === "active") && (
                    <button
                        onClick={() => void updateStatus("revoked")}
                        disabled={pending !== null}
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {pending === "revoke" ? "[ REVOKING... ]" : "REVOKE"}
                    </button>
                )}
            </div>

            {errorCode && (
                <p className="font-mono text-nd-caption text-nd-accent mt-nd-sm">
                    [ ERROR: {errorCode} ]
                </p>
            )}
        </div>
    );
}
