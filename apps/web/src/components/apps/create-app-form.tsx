"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Plus, WarningCircle } from "@phosphor-icons/react";

type FormStatus = "idle" | "submitting" | "error";

/**
 * Inline create-app form. Trigger is a brand CTA; expands into a card with the
 * shared input/button styles. On success, refreshes the RSC apps list.
 */
export function CreateAppForm() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [packageName, setPackageName] = useState("");
    const [formStatus, setFormStatus] = useState<FormStatus>("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [visible, setVisible] = useState(false);

    const reset = useCallback(() => {
        setName("");
        setPackageName("");
        setFormStatus("idle");
        setErrorMessage("");
        setVisible(false);
    }, []);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setFormStatus("submitting");
            setErrorMessage("");

            try {
                const res = await fetch("/api/v1/apps", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, packageName }),
                });

                if (!res.ok) {
                    const data = (await res.json().catch(() => ({}))) as {
                        error?: { message?: string; code?: string };
                    };
                    setFormStatus("error");
                    setErrorMessage(data?.error?.code ?? "CREATE_FAILED");
                    return;
                }

                reset();
                router.refresh();
            } catch {
                setFormStatus("error");
                setErrorMessage("NETWORK_ERROR");
            }
        },
        [name, packageName, reset, router],
    );

    if (!visible) {
        return (
            <button onClick={() => setVisible(true)} className="btn-primary">
                <Plus size={16} weight="bold" /> New app
            </button>
        );
    }

    return (
        <form onSubmit={(e) => void handleSubmit(e)} className="card p-nd-lg w-full max-w-md space-y-nd-lg">
            <p className="text-nd-body font-semibold text-nd-text-display">Create app</p>

            <div>
                <label htmlFor="app-name" className="field-label">
                    Name
                </label>
                <input
                    id="app-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Solana App"
                    required
                    maxLength={120}
                    disabled={formStatus === "submitting"}
                    className="input"
                />
            </div>

            <div>
                <label htmlFor="app-package" className="field-label">
                    Android package name
                </label>
                <input
                    id="app-package"
                    type="text"
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                    placeholder="com.example.myapp"
                    required
                    maxLength={255}
                    disabled={formStatus === "submitting"}
                    className="input font-mono"
                />
            </div>

            <div className="flex items-center gap-nd-md pt-nd-2xs">
                <button
                    type="submit"
                    disabled={formStatus === "submitting" || !name || !packageName}
                    className="btn-primary"
                >
                    {formStatus === "submitting" ? "Creating…" : "Create"}
                </button>
                <button
                    type="button"
                    onClick={reset}
                    disabled={formStatus === "submitting"}
                    className="btn-ghost"
                >
                    Cancel
                </button>
            </div>

            {formStatus === "error" && (
                <div className="flex items-center gap-nd-sm text-nd-accent">
                    <WarningCircle size={16} weight="fill" />
                    <span className="text-nd-body-sm">{errorMessage.replace(/_/g, " ").toLowerCase()}</span>
                </div>
            )}
        </form>
    );
}
