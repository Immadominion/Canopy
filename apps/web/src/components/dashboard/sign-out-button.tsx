"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Sign-out button for the dashboard header.
 *
 * Nothing Design: Space Mono, ALL CAPS, tertiary text.
 * Shows a brief "..." state while the sign-out request is in-flight.
 */
export function SignOutButton() {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function handleSignOut() {
        if (pending) return;
        setPending(true);
        try {
            await fetch("/api/v1/auth/sign-out", { method: "POST" });
        } finally {
            router.push("/sign-in");
            router.refresh();
        }
    }

    return (
        <button
            onClick={handleSignOut}
            disabled={pending}
            className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Sign out"
        >
            {pending ? "..." : "SIGN OUT"}
        </button>
    );
}
