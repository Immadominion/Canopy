"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type FormStatus = "idle" | "submitting" | "error";

/**
 * Inline create-app form — Nothing Design.
 *
 * Inputs: underline style, Space Grotesk, no rounded corners.
 * Labels: Space Mono ALL CAPS.
 * Status: inline text, no toast, no skeleton.
 *
 * On success, calls router.refresh() to re-fetch the RSC apps list.
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
                    body: JSON.stringify({ name, package_name: packageName }),
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
            <button
                onClick={() => setVisible(true)}
                className="font-mono text-nd-label text-nd-text-primary uppercase tracking-[0.08em] border border-nd-border-visible px-nd-md py-nd-sm hover:border-nd-text-secondary transition-colors"
            >
                + NEW APP
            </button>
        );
    }

    return (
        <form
            onSubmit={(e) => void handleSubmit(e)}
            className="border border-nd-border-visible p-nd-xl space-y-nd-lg"
        >
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                CREATE APP
            </p>

            {/* Name field */}
            <div>
                <label
                    htmlFor="app-name"
                    className="block font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs"
                >
                    NAME
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
                    className="w-full bg-transparent border-b border-nd-border-visible focus:border-nd-text-display outline-none py-nd-sm font-body text-nd-body text-nd-text-primary placeholder:text-nd-text-disabled transition-colors"
                />
            </div>

            {/* Package name field */}
            <div>
                <label
                    htmlFor="app-package"
                    className="block font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs"
                >
                    ANDROID PACKAGE NAME
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
                    className="w-full bg-transparent border-b border-nd-border-visible focus:border-nd-text-display outline-none py-nd-sm font-mono text-nd-body-sm text-nd-text-primary placeholder:text-nd-text-disabled transition-colors"
                />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-nd-lg pt-nd-sm">
                <button
                    type="submit"
                    disabled={formStatus === "submitting" || !name || !packageName}
                    className="font-mono text-nd-label text-nd-black bg-nd-text-display uppercase tracking-[0.08em] px-nd-lg py-nd-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                    {formStatus === "submitting" ? "CREATING..." : "CREATE →"}
                </button>
                <button
                    type="button"
                    onClick={reset}
                    disabled={formStatus === "submitting"}
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    CANCEL
                </button>
            </div>

            {/* Inline error — the one accent moment on this form */}
            {formStatus === "error" && (
                <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em]">
                    [ ERROR: {errorMessage} ]
                </p>
            )}
        </form>
    );
}
