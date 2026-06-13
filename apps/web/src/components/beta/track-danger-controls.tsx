"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Trash, WarningCircle } from "@phosphor-icons/react";

interface Props {
    appId: string;
    trackId: string;
}

/**
 * Delete-build control — hard-deletes a beta track (purges the APK + records).
 * Two-step confirm; the Arweave fingerprint record remains.
 */
export function TrackDangerControls({ appId, trackId }: Props) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [errorCode, setErrorCode] = useState("");

    async function handleDelete() {
        setDeleting(true);
        setErrorCode("");
        try {
            const res = await fetch(`/api/v1/beta/${trackId}`, { method: "DELETE" });
            if (!res.ok && res.status !== 204) {
                const data = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
                setErrorCode(data?.error?.code ?? "DELETE_FAILED");
                setDeleting(false);
                return;
            }
            router.push(`/dashboard/apps/${appId}`);
            router.refresh();
        } catch {
            setErrorCode("NETWORK_ERROR");
            setDeleting(false);
        }
    }

    if (!confirming) {
        return (
            <button onClick={() => setConfirming(true)} className="btn-ghost btn-danger">
                <Trash size={15} /> Delete build
            </button>
        );
    }

    return (
        <div className="card p-nd-md max-w-md" style={{ borderColor: "var(--accent-subtle)" }}>
            <p className="text-nd-body-sm text-nd-text-secondary mb-nd-md">
                Delete this build permanently? The APK is purged from storage and testers lose
                access. The immutable Arweave fingerprint record remains.
            </p>
            <div className="flex items-center gap-nd-md">
                <button
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="btn-primary disabled:opacity-50"
                    style={{
                        background: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
                        color: "#fff",
                    }}
                >
                    <Trash size={15} weight="bold" /> {deleting ? "Deleting…" : "Delete build"}
                </button>
                <button onClick={() => setConfirming(false)} disabled={deleting} className="btn-ghost">
                    Cancel
                </button>
            </div>
            {errorCode && (
                <p className="flex items-center gap-nd-xs text-nd-accent text-nd-body-sm mt-nd-sm">
                    <WarningCircle size={15} weight="fill" /> {errorCode.replace(/_/g, " ").toLowerCase()}
                </p>
            )}
        </div>
    );
}
