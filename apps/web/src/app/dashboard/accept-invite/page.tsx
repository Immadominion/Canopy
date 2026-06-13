"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * /dashboard/accept-invite — Accept a team invitation.
 *
 * Reads the `token` query param and calls POST /api/v1/org/invites/accept.
 * If the user is not signed in, they are redirected to sign-in first.
 */
function AcceptInviteInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!token) {
            setStatus("error");
            setMessage("Invalid invitation link — no token provided.");
            return;
        }

        void (async () => {
            const res = await fetch("/api/v1/org/invites/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });

            if (res.status === 401) {
                // Redirect to sign-in preserving the token.
                router.push(`/sign-in?redirect=/dashboard/accept-invite?token=${token}`);
                return;
            }

            const data = (await res.json()) as { message?: string; error?: { message?: string } };

            if (res.ok) {
                setStatus("success");
                setMessage(data.message ?? "You have joined the organisation.");
            } else {
                setStatus("error");
                setMessage(data.error?.message ?? "Failed to accept invitation.");
            }
        })();
    }, [token, router]);

    return (
        <div className="min-h-full bg-black flex items-center justify-center px-6">
            <div className="max-w-sm w-full space-y-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-nd-text-secondary">
                    Canopy
                </p>

                {status === "loading" && (
                    <div className="space-y-2">
                        <h1 className="font-grotesk text-2xl font-semibold text-nd-text-primary">
                            Accepting invitation…
                        </h1>
                        <p className="font-mono text-xs text-nd-text-secondary">One moment.</p>
                    </div>
                )}

                {status === "success" && (
                    <div className="space-y-4">
                        <h1 className="font-grotesk text-2xl font-semibold text-nd-text-primary">
                            Welcome to the team
                        </h1>
                        <p className="font-mono text-xs text-nd-text-secondary">{message}</p>
                        <a
                            href="/dashboard/org"
                            className="inline-block font-mono text-[10px] uppercase tracking-[0.08em] bg-nd-accent text-white px-6 py-2.5"
                        >
                            Go to organisation →
                        </a>
                    </div>
                )}

                {status === "error" && (
                    <div className="space-y-4">
                        <h1 className="font-grotesk text-2xl font-semibold text-nd-text-primary">
                            Invitation error
                        </h1>
                        <p className="font-mono text-xs text-nd-text-secondary">{message}</p>
                        <a
                            href="/dashboard"
                            className="inline-block font-mono text-[10px] uppercase tracking-[0.08em] border border-nd-border-visible text-nd-text-secondary px-6 py-2.5 hover:border-nd-text-secondary transition-colors"
                        >
                            Back to dashboard
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AcceptInvitePage() {
    return (
        <Suspense>
            <AcceptInviteInner />
        </Suspense>
    );
}
