"use client";

import { useEffect } from "react";

/**
 * Apps page error boundary.
 * Nothing Design: one accent red label, inline description, retry action.
 */
export default function AppsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        if (typeof window !== "undefined" && error.digest) {
            console.error("[apps] error boundary triggered", {
                digest: error.digest,
                message: error.message,
            });
        }
    }, [error]);

    return (
        <div className="flex flex-col items-start gap-nd-xl">
            <div>
                <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.1em] mb-nd-xs">
                    ERROR
                </p>
                <p className="font-body text-nd-body text-nd-text-primary">
                    Failed to load your apps.
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
