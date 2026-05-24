"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * /dashboard/org/create — Create an organisation.
 *
 * Posts to POST /api/v1/org and redirects to /dashboard/org on success.
 * Nothing Design: minimal form, one accent CTA.
 */
export default function CreateOrgPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus("loading");
        setErrorMsg("");

        const res = await fetch("/api/v1/org", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });

        if (res.ok) {
            router.push("/dashboard/org");
            router.refresh();
        } else {
            const data = (await res.json()) as { error?: { message?: string } };
            setErrorMsg(data.error?.message ?? "Failed to create organisation");
            setStatus("error");
        }
    }

    return (
        <div className="min-h-screen bg-black text-nd-text-primary">
            {/* header */}
            <div className="border-b border-nd-border-subtle px-6 py-8">
                <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-nd-text-secondary mb-2">
                    Organisation
                </p>
                <h1 className="font-grotesk text-2xl font-semibold">Create organisation</h1>
            </div>

            <div className="px-6 py-8 max-w-md">
                <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-6">
                    <div className="space-y-2">
                        <label className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary block">
                            Organisation name
                        </label>
                        <input
                            type="text"
                            required
                            minLength={2}
                            maxLength={100}
                            value={name}
                            onChange={(e) => { setName(e.target.value); }}
                            placeholder="Acme Labs"
                            className="w-full bg-transparent border border-nd-border-visible px-3 py-2 font-mono text-sm text-nd-text-primary placeholder:text-nd-text-tertiary focus:outline-none focus:border-nd-text-secondary transition-colors"
                        />
                    </div>

                    {status === "error" && (
                        <p className="font-mono text-[10px] text-nd-accent">{errorMsg}</p>
                    )}

                    <div className="flex items-center gap-4 pt-2">
                        <button
                            type="submit"
                            disabled={status === "loading"}
                            className="font-mono text-[10px] uppercase tracking-[0.08em] bg-nd-accent text-white px-6 py-2.5 disabled:opacity-50 transition-opacity"
                        >
                            {status === "loading" ? "Creating…" : "Create organisation"}
                        </button>
                        <a
                            href="/dashboard"
                            className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-tertiary hover:text-nd-text-secondary transition-colors"
                        >
                            Cancel
                        </a>
                    </div>
                </form>
            </div>
        </div>
    );
}
