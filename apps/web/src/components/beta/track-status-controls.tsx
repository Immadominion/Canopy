"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Check, ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

interface Props {
    trackId: string;
    currentStatus: string;
}

/**
 * Track status controls — activate (after a clean scan) or revoke a build.
 */
export function TrackStatusControls({ trackId, currentStatus }: Props) {
    const router = useRouter();
    const [pending, setPending] = useState<"activate" | "revoke" | null>(null);
    const [errorCode, setErrorCode] = useState("");
    const [rechecking, setRechecking] = useState(false);
    const [recheckMsg, setRecheckMsg] = useState("");

    async function recheckScan() {
        setRechecking(true);
        setRecheckMsg("");
        try {
            const res = await fetch(`/api/v1/beta/${trackId}/recheck`, { method: "POST" });
            const data = (await res.json().catch(() => ({}))) as { ready?: boolean };
            if (data.ready) {
                router.refresh();
            } else {
                setRecheckMsg(
                    "Still scanning — VirusTotal hasn't finished analyzing this build yet. Check again in a few minutes.",
                );
            }
        } catch {
            setRecheckMsg("Couldn't reach the server. Try again.");
        } finally {
            setRechecking(false);
        }
    }

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

    if (currentStatus === "pending_scan" || currentStatus === "scan_in_progress") {
        return (
            <div className="space-y-nd-md">
                <span className="chip chip--warning">
                    <ArrowClockwise size={13} className="animate-spin" /> Scanning…
                </span>
                <p className="text-nd-caption text-nd-text-disabled max-w-md leading-relaxed">
                    Heads up — the first scan of a brand-new build can take a few minutes
                    (occasionally longer) while VirusTotal analyzes it. This page updates on its
                    own and Canopy re-checks in the background, so you can safely leave and come
                    back.
                </p>
                <div>
                    <button
                        onClick={() => void recheckScan()}
                        disabled={rechecking}
                        className="btn-secondary disabled:opacity-50"
                    >
                        <ArrowClockwise size={15} className={rechecking ? "animate-spin" : ""} />
                        {rechecking ? "Checking…" : "Check for results"}
                    </button>
                    {recheckMsg && (
                        <p className="text-nd-caption text-nd-text-secondary mt-nd-sm max-w-md leading-relaxed">
                            {recheckMsg}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-nd-md">
                {currentStatus === "scan_passed" && (
                    <button
                        onClick={() => void updateStatus("active")}
                        disabled={pending !== null}
                        className="btn-primary disabled:opacity-50"
                    >
                        <Check size={16} weight="bold" />
                        {pending === "activate" ? "Activating…" : "Activate build"}
                    </button>
                )}

                {(currentStatus === "scan_passed" || currentStatus === "active") && (
                    <button
                        onClick={() => void updateStatus("revoked")}
                        disabled={pending !== null}
                        className="btn-ghost btn-danger disabled:opacity-50"
                    >
                        {pending === "revoke" ? "Revoking…" : "Revoke"}
                    </button>
                )}
            </div>

            {errorCode && (
                <p className="flex items-center gap-nd-xs text-nd-accent text-nd-body-sm mt-nd-sm">
                    <WarningCircle size={15} weight="fill" /> {errorCode.replace(/_/g, " ").toLowerCase()}
                </p>
            )}
        </div>
    );
}
