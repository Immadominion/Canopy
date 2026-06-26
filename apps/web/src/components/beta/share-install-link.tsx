"use client";

import { useEffect, useState } from "react";

/**
 * Shows the install link a developer sends to testers, with a copy button.
 * The link is the same for everyone; only wallets on the allowlist can install
 * through it, so there is no open invite. Add tester wallets first, then share.
 */
export function ShareInstallLink({ trackId }: { trackId: string }) {
    const [link, setLink] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setLink(`${window.location.origin}/install/${trackId}`);
    }, [trackId]);

    async function copy() {
        try {
            await navigator.clipboard.writeText(link || `/install/${trackId}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard blocked — the link is still visible to copy by hand
        }
    }

    return (
        <div>
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-md">
                SHARE WITH TESTERS
            </p>
            <div className="flex items-stretch gap-nd-sm">
                <code className="flex-1 min-w-0 truncate font-mono text-nd-caption text-nd-text-secondary border border-nd-border px-nd-md py-nd-sm">
                    {link || `…/install/${trackId}`}
                </code>
                <button
                    type="button"
                    onClick={() => void copy()}
                    className="shrink-0 font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-lg py-nd-sm hover:border-nd-border-visible transition-colors"
                >
                    {copied ? "COPIED" : "COPY"}
                </button>
            </div>
            <p className="font-body text-nd-caption text-nd-text-disabled mt-nd-sm leading-snug">
                Add your testers&apos; wallet addresses above, then send them this link. They sign in
                with that wallet and install through the Canopy app. Only allowlisted wallets can install.
            </p>
        </div>
    );
}
