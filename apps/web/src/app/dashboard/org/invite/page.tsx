"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * /dashboard/org/invite — Client component form to invite a team member.
 *
 * Posts to POST /api/v1/org/members and redirects back to /dashboard/org.
 * Nothing Design: minimal form, one accent action.
 */
export default function InvitePage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<"admin" | "developer" | "viewer">("developer");
    const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus("loading");
        setErrorMsg("");

        const res = await fetch("/api/v1/org/members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, role }),
        });

        if (res.ok) {
            router.push("/dashboard/org");
            router.refresh();
        } else {
            const data = (await res.json()) as { error?: { message?: string } };
            setErrorMsg(data.error?.message ?? "Failed to send invite");
            setStatus("error");
        }
    }

    return (
        <div className="min-h-full bg-black text-nd-text-primary">
            {/* header */}
            <div className="border-b border-nd-border-subtle px-6 py-8">
                <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-nd-text-secondary mb-2">
                    Organisation
                </p>
                <h1 className="font-grotesk text-2xl font-semibold">Invite team member</h1>
            </div>

            <div className="px-6 py-8 max-w-md">
                <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-6">
                    <div className="space-y-2">
                        <label className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary block">
                            Email address
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); }}
                            placeholder="dev@example.com"
                            className="w-full bg-transparent border border-nd-border-visible px-3 py-2 font-mono text-sm text-nd-text-primary placeholder:text-nd-text-tertiary focus:outline-none focus:border-nd-text-secondary transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary block">
                            Role
                        </label>
                        <div className="flex gap-2">
                            {(["admin", "developer", "viewer"] as const).map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => { setRole(r); }}
                                    className={`font-mono text-[10px] uppercase tracking-[0.08em] px-3 py-1.5 border transition-colors ${role === r
                                            ? "border-nd-text-primary text-nd-text-primary"
                                            : "border-nd-border-subtle text-nd-text-tertiary hover:border-nd-border-visible"
                                        }`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                        <p className="font-mono text-[10px] text-nd-text-tertiary">
                            {role === "admin" && "Can invite members, manage apps, and view all data."}
                            {role === "developer" && "Can view and manage apps but cannot invite members."}
                            {role === "viewer" && "Read-only access to all org data."}
                        </p>
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
                            {status === "loading" ? "Sending…" : "Send invite"}
                        </button>
                        <a
                            href="/dashboard/org"
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
