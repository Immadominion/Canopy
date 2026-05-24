"use client";

import { useEffect } from "react";

/**
 * Dashboard error boundary — required client component per Next.js.
 *
 * Nothing Design: no modals, no toast popups. Inline label + description.
 * Accent red is used for the error label (one per screen, valid interrupt).
 */
export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log to Sentry via the global error handler if configured.
        // The Sentry Next.js integration captures unhandled errors automatically,
        // but explicit logging helps with error digest tracking.
        if (typeof window !== "undefined" && error.digest) {
            console.error("[dashboard] error boundary triggered", {
                digest: error.digest,
                message: error.message,
            });
        }
    }, [error]);

    return (
        <div className="flex flex-col items-start justify-center min-h-[40vh] gap-nd-xl px-4">
            <div>
                <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.1em] mb-nd-xs">
                    ERROR
                </p>
                <p className="font-body text-nd-body text-nd-text-primary max-w-sm">
                    Something went wrong loading this page.
                </p>
                {error.digest && (
                    <p className="font-mono text-nd-caption text-nd-text-disabled mt-nd-sm tracking-[0.06em]">
                        REF {error.digest}
                    </p>
                )}
            </div>

            <button
                onClick={reset}
                className="font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] border border-nd-border px-nd-lg py-nd-sm hover:text-nd-text-primary hover:border-nd-text-secondary transition-colors"
            >
                TRY AGAIN
            </button>
        </div>
    );
}
