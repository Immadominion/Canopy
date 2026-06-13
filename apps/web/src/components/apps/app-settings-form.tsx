"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Check, WarningCircle } from "@phosphor-icons/react";

type FormStatus = "idle" | "submitting" | "saved" | "error";

interface AppData {
    id: string;
    name: string;
    packageName: string;
    description: string | null;
    dappStoreAppId: string | null;
}

/**
 * App settings edit form. Package name is immutable (shown read-only).
 */
export function AppSettingsForm({ app }: { app: AppData }) {
    const router = useRouter();
    const [name, setName] = useState(app.name);
    const [description, setDescription] = useState(app.description ?? "");
    const [dappStoreAppId, setDappStoreAppId] = useState(app.dappStoreAppId ?? "");
    const [status, setStatus] = useState<FormStatus>("idle");
    const [errorCode, setErrorCode] = useState("");

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setStatus("submitting");
            setErrorCode("");
            try {
                const res = await fetch(`/api/v1/apps/${app.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: name.trim(),
                        description: description.trim() === "" ? null : description.trim(),
                        dappStoreAppId: dappStoreAppId.trim() === "" ? null : dappStoreAppId.trim(),
                    }),
                });
                if (!res.ok) {
                    const data = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
                    setStatus("error");
                    setErrorCode(data?.error?.code ?? "UPDATE_FAILED");
                    return;
                }
                setStatus("saved");
                router.refresh();
            } catch {
                setStatus("error");
                setErrorCode("NETWORK_ERROR");
            }
        },
        [app.id, name, description, dappStoreAppId, router],
    );

    return (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-nd-lg max-w-lg">
            <div>
                <label htmlFor="app-name" className="field-label">
                    Name
                </label>
                <input
                    id="app-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setStatus("idle");
                    }}
                    required
                    maxLength={120}
                    disabled={status === "submitting"}
                    className="input"
                />
            </div>

            <div>
                <span className="field-label">Android package name</span>
                <p className="input flex items-center font-mono text-nd-body-sm text-nd-text-secondary cursor-not-allowed">
                    {app.packageName}
                </p>
                <p className="mt-nd-xs text-nd-caption text-nd-text-disabled">
                    Immutable — identifies this app across tracks, testers, and installs.
                </p>
            </div>

            <div>
                <label htmlFor="app-description" className="field-label">
                    Description
                </label>
                <textarea
                    id="app-description"
                    value={description}
                    onChange={(e) => {
                        setDescription(e.target.value);
                        setStatus("idle");
                    }}
                    rows={3}
                    maxLength={2000}
                    placeholder="What this app does (optional)"
                    disabled={status === "submitting"}
                    className="input"
                />
            </div>

            <div>
                <label htmlFor="app-dappstore-id" className="field-label">
                    dApp Store app ID
                </label>
                <input
                    id="app-dappstore-id"
                    type="text"
                    value={dappStoreAppId}
                    onChange={(e) => {
                        setDappStoreAppId(e.target.value);
                        setStatus("idle");
                    }}
                    maxLength={255}
                    placeholder="On-chain App NFT address (optional)"
                    disabled={status === "submitting"}
                    className="input font-mono"
                />
            </div>

            <div className="flex items-center gap-nd-md pt-nd-2xs">
                <button type="submit" disabled={status === "submitting" || !name.trim()} className="btn-primary">
                    {status === "submitting" ? "Saving…" : "Save changes"}
                </button>
                {status === "saved" && (
                    <span className="flex items-center gap-nd-xs text-nd-success text-nd-body-sm">
                        <Check size={16} weight="bold" /> Saved
                    </span>
                )}
            </div>

            {status === "error" && (
                <p className="flex items-center gap-nd-xs text-nd-accent text-nd-body-sm">
                    <WarningCircle size={15} weight="fill" /> {errorCode.replace(/_/g, " ").toLowerCase()}
                </p>
            )}
        </form>
    );
}
