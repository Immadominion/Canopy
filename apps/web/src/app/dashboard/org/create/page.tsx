"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * /dashboard/org/create — Create an organisation.
 * Posts to POST /api/v1/org and redirects to /dashboard/org on success.
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
        <div className="max-w-2xl mx-auto">
            <header className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    ORGANIZATION
                </p>
                <h1 className="font-body text-nd-display-md text-nd-text-display leading-tight">
                    Create organization
                </h1>
                <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm max-w-prose leading-relaxed">
                    Your organization holds your apps, team, API keys, and plan. You need one to make
                    API keys and send analytics.
                </p>
            </header>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-nd-lg max-w-md">
                <div className="space-y-nd-xs">
                    <label
                        htmlFor="org-name"
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] block"
                    >
                        ORGANIZATION NAME
                    </label>
                    <input
                        id="org-name"
                        type="text"
                        required
                        minLength={2}
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Acme Labs"
                        className="w-full bg-transparent border border-nd-border focus:border-nd-border-visible outline-none rounded-nd-card-compact px-nd-md py-nd-sm font-mono text-nd-caption text-nd-text-primary placeholder:text-nd-text-disabled transition-colors"
                    />
                </div>

                {status === "error" && (
                    <p className="font-mono text-nd-body text-nd-accent">[ {errorMsg} ]</p>
                )}

                <div className="flex items-center gap-nd-md pt-nd-xs">
                    <button
                        type="submit"
                        disabled={status === "loading"}
                        className="font-mono text-nd-label uppercase tracking-[0.08em] bg-nd-brand text-nd-on-brand px-nd-lg py-nd-sm rounded-nd-card-compact hover:bg-nd-brand-hover disabled:opacity-50 transition-colors"
                    >
                        {status === "loading" ? "CREATING…" : "CREATE ORGANIZATION"}
                    </button>
                    <Link
                        href="/dashboard/apps"
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                    >
                        CANCEL
                    </Link>
                </div>
            </form>
        </div>
    );
}
