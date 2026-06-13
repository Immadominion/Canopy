"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Trash, WarningCircle } from "@phosphor-icons/react";

type DeleteStatus = "idle" | "confirming" | "deleting" | "error";

interface Props {
    appId: string;
    appName: string;
    trackCount: number;
}

/**
 * Danger zone — permanently delete an app and all of its builds (type-to-confirm).
 */
export function DeleteAppDangerZone({ appId, appName, trackCount }: Props) {
    const router = useRouter();
    const [status, setStatus] = useState<DeleteStatus>("idle");
    const [confirmText, setConfirmText] = useState("");
    const [errorCode, setErrorCode] = useState("");

    const canDelete = confirmText.trim() === appName && status !== "deleting";

    async function handleDelete() {
        if (!canDelete) return;
        setStatus("deleting");
        setErrorCode("");
        try {
            const res = await fetch(`/api/v1/apps/${appId}?cascade=true`, { method: "DELETE" });
            if (!res.ok && res.status !== 204) {
                const data = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
                setStatus("error");
                setErrorCode(data?.error?.code ?? "DELETE_FAILED");
                return;
            }
            router.push("/dashboard/apps");
            router.refresh();
        } catch {
            setStatus("error");
            setErrorCode("NETWORK_ERROR");
        }
    }

    return (
        <div className="card p-nd-lg" style={{ borderColor: "var(--accent-subtle)" }}>
            <div className="flex items-center gap-nd-sm mb-nd-sm">
                <WarningCircle size={18} weight="fill" className="text-nd-accent" />
                <p className="text-nd-body font-semibold text-nd-accent">Danger zone</p>
            </div>
            <p className="text-nd-body-sm text-nd-text-secondary mb-nd-lg max-w-lg">
                Permanently delete <span className="text-nd-text-primary font-medium">{appName}</span> and
                all of its builds. This removes{" "}
                {trackCount === 1 ? "1 beta track" : `${trackCount} beta tracks`}, every tester
                allowlist, install record, and purges all APK binaries from storage. The immutable
                Arweave fingerprint records remain. This cannot be undone.
            </p>

            {status === "idle" || status === "error" ? (
                <>
                    <button onClick={() => setStatus("confirming")} className="btn-secondary btn-danger">
                        <Trash size={15} /> Delete app
                    </button>
                    {status === "error" && (
                        <p className="flex items-center gap-nd-xs text-nd-accent text-nd-body-sm mt-nd-md">
                            <WarningCircle size={15} weight="fill" /> {errorCode.replace(/_/g, " ").toLowerCase()}
                        </p>
                    )}
                </>
            ) : (
                <div className="space-y-nd-md max-w-md">
                    <label htmlFor="confirm-app-name" className="block text-nd-body-sm text-nd-text-secondary">
                        Type <span className="font-mono text-nd-text-primary">{appName}</span> to confirm
                    </label>
                    <input
                        id="confirm-app-name"
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        autoComplete="off"
                        disabled={status === "deleting"}
                        className="input font-mono"
                    />
                    <div className="flex items-center gap-nd-md">
                        <button
                            onClick={() => void handleDelete()}
                            disabled={!canDelete}
                            className="btn-primary disabled:opacity-50"
                            style={{
                                background: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
                                color: "#fff",
                            }}
                        >
                            <Trash size={15} weight="bold" /> {status === "deleting" ? "Deleting…" : "Delete permanently"}
                        </button>
                        <button
                            onClick={() => {
                                setStatus("idle");
                                setConfirmText("");
                            }}
                            disabled={status === "deleting"}
                            className="btn-ghost"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
