"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Create a reusable tester group — client component.
 * API: POST /api/v1/beta/tester-groups with { name, description? }.
 * On success, navigates to the new group's detail page.
 */
export function CreateGroupForm() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
    const [errorCode, setErrorCode] = useState("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setErrorCode("NAME_REQUIRED");
            setStatus("error");
            return;
        }
        setStatus("submitting");
        setErrorCode("");
        try {
            const res = await fetch("/api/v1/beta/tester-groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: trimmed,
                    description: description.trim() || undefined,
                }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: { code?: string } };
                setErrorCode(data.error?.code ?? "CREATE_FAILED");
                setStatus("error");
                return;
            }
            const data = (await res.json()) as { id: string };
            router.push(`/dashboard/tester-groups/${data.id}`);
        } catch {
            setErrorCode("NETWORK_ERROR");
            setStatus("error");
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mb-nd-2xl">
            <label
                htmlFor="group-name"
                className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs block"
            >
                NEW GROUP — NAME
            </label>
            <input
                id="group-name"
                type="text"
                maxLength={80}
                className="w-full bg-transparent border border-nd-border focus:border-nd-border-visible outline-none font-mono text-nd-caption text-nd-text-primary px-nd-md py-nd-sm placeholder:text-nd-text-disabled transition-colors mb-nd-md"
                placeholder="QA Team"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={status === "submitting"}
            />
            <label
                htmlFor="group-description"
                className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs block"
            >
                DESCRIPTION — OPTIONAL
            </label>
            <input
                id="group-description"
                type="text"
                maxLength={500}
                className="w-full bg-transparent border border-nd-border focus:border-nd-border-visible outline-none font-mono text-nd-caption text-nd-text-primary px-nd-md py-nd-sm placeholder:text-nd-text-disabled transition-colors mb-nd-lg"
                placeholder="Internal testers across all apps"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={status === "submitting"}
            />

            {status === "error" && errorCode && (
                <p className="font-mono text-nd-body text-nd-accent mb-nd-lg">[ ERROR: {errorCode} ]</p>
            )}

            <button
                type="submit"
                disabled={status === "submitting"}
                className="font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-xl py-nd-sm hover:border-nd-border-visible transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {status === "submitting" ? "[ CREATING... ]" : "CREATE GROUP →"}
            </button>
        </form>
    );
}
