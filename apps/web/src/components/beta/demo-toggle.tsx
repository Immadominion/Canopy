"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Toggle a build as a public demo. When on, any wallet that connects the Canopy
 * tester app can see and install this build without being on the allowlist.
 * For showing Canopy to reviewers.
 */
export function DemoToggle({ trackId, isDemo }: { trackId: string; isDemo: boolean }) {
    const router = useRouter();
    const [on, setOn] = useState(isDemo);
    const [busy, setBusy] = useState(false);

    async function toggle() {
        setBusy(true);
        const next = !on;
        try {
            const res = await fetch(`/api/v1/beta/${trackId}/demo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isDemo: next }),
            });
            if (res.ok) {
                setOn(next);
                router.refresh();
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                PUBLIC DEMO
            </p>
            <button
                type="button"
                onClick={() => void toggle()}
                disabled={busy}
                className={`font-mono text-nd-label uppercase tracking-[0.08em] border px-nd-lg py-nd-sm rounded-nd-card-compact transition-colors disabled:opacity-40 ${
                    on
                        ? "border-nd-brand text-nd-brand-hover"
                        : "border-nd-border text-nd-text-secondary hover:border-nd-border-visible"
                }`}
            >
                {busy ? "[ SAVING... ]" : on ? "DEMO ON ✓" : "TURN ON DEMO"}
            </button>
            <p className="font-body text-nd-caption text-nd-text-disabled mt-nd-sm max-w-md leading-snug">
                {on
                    ? "Any wallet that connects the Canopy tester app can see and install this build, no allowlist needed. Turn it off to go back to allowlist only."
                    : "Turn this on to let any wallet that connects the Canopy app install this build without being on the allowlist. Use it to show Canopy to reviewers."}
            </p>
        </div>
    );
}
