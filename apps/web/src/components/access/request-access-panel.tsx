"use client";

import { useCallback, useMemo, useState } from "react";

type Status = "unverified" | "pending" | "rejected";
type FormStatus = "idle" | "submitting" | "error";

interface PendingRequest {
    code: string;
    displayName: string;
    projectSummary: string;
}

/**
 * Publisher access request — Nothing Design.
 *
 * Unverified / rejected -> a short form (name + what you're building).
 * On submit it creates the request; the founder is pinged on Telegram with
 * Approve/Reject buttons. We then show a prefilled t.me deep link so the user
 * can also message the founder directly with their verification code.
 */
export function RequestAccessPanel({
    initialStatus,
    founderTelegram,
    pending: initialPending,
}: {
    initialStatus: Status;
    founderTelegram: string;
    pending: PendingRequest | null;
}) {
    const [status, setStatus] = useState<Status>(initialStatus);
    const [pending, setPending] = useState<PendingRequest | null>(initialPending);

    const [displayName, setDisplayName] = useState(initialPending?.displayName ?? "");
    const [projectSummary, setProjectSummary] = useState(initialPending?.projectSummary ?? "");
    const [contactTelegram, setContactTelegram] = useState("");
    const [formStatus, setFormStatus] = useState<FormStatus>("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [copied, setCopied] = useState(false);

    const handle = founderTelegram.replace(/^@/, "");

    const telegramMessage = useMemo(() => {
        if (!pending) return "";
        return `Hi! I'm ${pending.displayName}. I'm building: ${pending.projectSummary}. My Canopy verification code is ${pending.code}.`;
    }, [pending]);

    const telegramLink = useMemo(
        () => `https://t.me/${handle}?text=${encodeURIComponent(telegramMessage)}`,
        [handle, telegramMessage],
    );

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setFormStatus("submitting");
            setErrorMessage("");
            try {
                const res = await fetch("/api/v1/access-requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        displayName,
                        projectSummary,
                        contactTelegram: contactTelegram.trim() || undefined,
                    }),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    status?: string;
                    code?: string;
                    error?: { code?: string };
                };
                if (!res.ok) {
                    setFormStatus("error");
                    setErrorMessage(data?.error?.code ?? "REQUEST_FAILED");
                    return;
                }
                if (data.status === "approved") {
                    // Already approved elsewhere — reload into the dashboard.
                    window.location.reload();
                    return;
                }
                setPending({ code: data.code ?? "—", displayName, projectSummary });
                setStatus("pending");
                setFormStatus("idle");
            } catch {
                setFormStatus("error");
                setErrorMessage("NETWORK_ERROR");
            }
        },
        [displayName, projectSummary, contactTelegram],
    );

    const copyMessage = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(telegramMessage);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard may be unavailable — the link still carries the text */
        }
    }, [telegramMessage]);

    // ── Pending view ──────────────────────────────────────────────────────────
    if (status === "pending" && pending) {
        return (
            <div className="max-w-xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                    ACCESS REQUESTED
                </p>
                <p className="font-body text-nd-body text-nd-text-secondary mb-nd-md">
                    Your request is in review. To speed things up, message the Canopy team on
                    Telegram with your verification code below — they&apos;ll match it and approve
                    your wallet.
                </p>

                <div className="border border-nd-border-visible p-nd-lg mb-nd-lg">
                    <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                        VERIFICATION CODE
                    </p>
                    <p className="font-mono text-nd-display-sm text-nd-text-display tracking-[0.12em]">
                        {pending.code}
                    </p>
                </div>

                <div className="flex items-center gap-nd-lg">
                    <a
                        href={telegramLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-nd-label text-nd-black bg-nd-text-display uppercase tracking-[0.08em] px-nd-lg py-nd-sm transition-opacity hover:opacity-80"
                    >
                        MESSAGE ON TELEGRAM →
                    </a>
                    <button
                        onClick={() => void copyMessage()}
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                    >
                        {copied ? "[ COPIED ]" : "COPY MESSAGE"}
                    </button>
                </div>

                <p className="mt-nd-xl font-mono text-nd-caption text-nd-text-disabled tracking-[0.04em]">
                    @{handle}
                </p>
            </div>
        );
    }

    // ── Request form (unverified / rejected) ───────────────────────────────────
    return (
        <div className="max-w-xl">
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg">
                REQUEST PUBLISHER ACCESS
            </p>
            <p className="font-body text-nd-body text-nd-text-secondary mb-nd-xl">
                {status === "rejected"
                    ? "Your previous request wasn't approved. You can submit again with more detail."
                    : "Canopy gates beta distribution to verified Solana Mobile publishers. Tell us who you are and what you're building — the team reviews each request manually."}
            </p>

            <form
                onSubmit={(e) => void handleSubmit(e)}
                className="border border-nd-border-visible p-nd-xl space-y-nd-lg"
            >
                <div>
                    <label
                        htmlFor="ar-name"
                        className="block font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs"
                    >
                        YOUR NAME
                    </label>
                    <input
                        id="ar-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Ada Lovelace"
                        required
                        maxLength={120}
                        disabled={formStatus === "submitting"}
                        className="w-full bg-transparent border-b border-nd-border-visible focus:border-nd-text-display outline-none py-nd-sm font-body text-nd-body text-nd-text-primary placeholder:text-nd-text-disabled transition-colors"
                    />
                </div>

                <div>
                    <label
                        htmlFor="ar-project"
                        className="block font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs"
                    >
                        WHAT ARE YOU BUILDING?
                    </label>
                    <textarea
                        id="ar-project"
                        value={projectSummary}
                        onChange={(e) => setProjectSummary(e.target.value)}
                        placeholder="A Solana Mobile wallet for…"
                        required
                        maxLength={2000}
                        rows={3}
                        disabled={formStatus === "submitting"}
                        className="w-full bg-transparent border-b border-nd-border-visible focus:border-nd-text-display outline-none py-nd-sm font-body text-nd-body text-nd-text-primary placeholder:text-nd-text-disabled transition-colors resize-none"
                    />
                </div>

                <div>
                    <label
                        htmlFor="ar-tg"
                        className="block font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs"
                    >
                        TELEGRAM (OPTIONAL)
                    </label>
                    <input
                        id="ar-tg"
                        type="text"
                        value={contactTelegram}
                        onChange={(e) => setContactTelegram(e.target.value)}
                        placeholder="@yourhandle"
                        maxLength={64}
                        disabled={formStatus === "submitting"}
                        className="w-full bg-transparent border-b border-nd-border-visible focus:border-nd-text-display outline-none py-nd-sm font-mono text-nd-body-sm text-nd-text-primary placeholder:text-nd-text-disabled transition-colors"
                    />
                </div>

                <div className="pt-nd-sm">
                    <button
                        type="submit"
                        disabled={formStatus === "submitting" || !displayName || !projectSummary}
                        className="font-mono text-nd-label text-nd-black bg-nd-text-display uppercase tracking-[0.08em] px-nd-lg py-nd-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    >
                        {formStatus === "submitting" ? "SUBMITTING..." : "GET ACCESS →"}
                    </button>
                </div>

                {formStatus === "error" && (
                    <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em]">
                        [ ERROR: {errorMessage} ]
                    </p>
                )}
            </form>
        </div>
    );
}
