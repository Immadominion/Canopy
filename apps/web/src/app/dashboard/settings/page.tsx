import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Settings",
};

const SETTINGS_LINKS = [
    {
        href: "/dashboard/settings/api-keys",
        label: "API KEYS",
        description: "Create and revoke keys the SDK and CI use to send analytics and deploy builds.",
    },
    {
        href: "/dashboard/org",
        label: "ORGANIZATION",
        description: "Your org name, team members, and invitations.",
    },
    {
        href: "/dashboard/billing",
        label: "BILLING",
        description: "Your plan and payments. Upgrade or extend by paying in USDC on Solana.",
    },
];

/**
 * /dashboard/settings — settings landing. The nav links here; the individual
 * settings areas live underneath (api-keys) or alongside (org, billing).
 */
export default function SettingsPage() {
    return (
        <div className="max-w-3xl mx-auto">
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-2xl">
                SETTINGS
            </p>

            <div className="grid gap-nd-md">
                {SETTINGS_LINKS.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="group block border border-nd-border hover:border-nd-text-disabled transition-colors p-nd-lg rounded-lg"
                    >
                        <div className="flex items-baseline justify-between gap-nd-md">
                            <span className="font-mono text-nd-label text-nd-text-primary uppercase tracking-[0.08em] group-hover:text-nd-text-display transition-colors">
                                {item.label}
                            </span>
                            <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] group-hover:text-nd-text-secondary transition-colors">
                                →
                            </span>
                        </div>
                        <p className="mt-nd-sm font-body text-nd-body-sm text-nd-text-secondary leading-snug">
                            {item.description}
                        </p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
