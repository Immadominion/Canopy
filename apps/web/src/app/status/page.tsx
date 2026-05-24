import type { Metadata } from "next";

import { runHealthChecks, type ComponentStatus } from "@/lib/health/checks";

export const metadata: Metadata = {
    title: "System Status | Canopy",
    description: "Current operational status of Canopy services.",
    robots: { index: false, follow: false },
};

// Revalidate every 60 s — fresh enough for a public status page
export const revalidate = 60;

// ── Display helpers ────────────────────────────────────────────────────────

const STATUS_HERO: Record<ComponentStatus, string> = {
    operational: "ALL SYSTEMS OPERATIONAL",
    degraded: "PARTIAL DEGRADATION",
    outage: "SERVICE OUTAGE",
};

/** Tailwind text-color class for each status — data values use status color */
const STATUS_COLOR: Record<ComponentStatus, string> = {
    operational: "text-[#4A9E5C]", // nd-success
    degraded: "text-[#D4A843]", // nd-warning
    outage: "text-[#D71921]", // nd-accent (one per screen)
};

/** Human-readable component names */
const COMPONENT_NAMES: Record<string, string> = {
    database: "DATABASE",
    analytics_ingest: "ANALYTICS INGEST",
};

// ── Page ──────────────────────────────────────────────────────────────────

export default async function StatusPage() {
    const report = await runHealthChecks();

    // Format the timestamp as a UTC string — Space Mono, tertiary metadata
    const checkedAt = new Date(report.timestamp).toUTCString();

    return (
        <main className="min-h-screen bg-[#000000] flex flex-col">
            {/* ── Hero section — dot-grid + status indicator ── */}
            <section className="relative overflow-hidden border-b border-[#222222]">
                {/* Dot-grid background (one per page — Nothing Design pattern break) */}
                <div
                    className="absolute inset-0 opacity-25"
                    style={{
                        backgroundImage: "radial-gradient(circle, #333333 1px, transparent 1px)",
                        backgroundSize: "16px 16px",
                    }}
                />

                <div className="relative z-10 px-8 pt-24 pb-16">
                    {/* Wordmark — tertiary label */}
                    <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[#666666] mb-8">
                        CANOPY / SYSTEM STATUS
                    </p>

                    {/* Primary: large display status */}
                    <h1
                        className={`font-display text-[48px] leading-[1.05] tracking-[-0.02em] font-bold ${STATUS_COLOR[report.status]}`}
                    >
                        {STATUS_HERO[report.status]}
                    </h1>

                    {/* Secondary: timestamp */}
                    <p className="mt-4 font-mono text-[12px] tracking-[0.04em] text-[#999999]">
                        LAST CHECKED {checkedAt.toUpperCase()}
                    </p>
                </div>
            </section>

            {/* ── Component statuses ── */}
            <section className="px-8 py-12 flex-1">
                <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[#666666] mb-6">
                    COMPONENTS
                </p>

                <ul className="divide-y divide-[#222222] max-w-xl" role="list">
                    {report.checks.map((check) => {
                        const label = COMPONENT_NAMES[check.name] ?? check.name.toUpperCase();
                        return (
                            <li
                                key={check.name}
                                className="flex items-center justify-between py-4"
                            >
                                {/* Component name — secondary */}
                                <span className="font-mono text-[13px] tracking-[0.04em] text-[#E8E8E8]">
                                    {label}
                                </span>

                                {/* Status badge — data value uses status color */}
                                <span
                                    className={`font-mono text-[11px] tracking-[0.08em] uppercase ${STATUS_COLOR[check.status]}`}
                                    aria-label={`${label}: ${check.status}`}
                                >
                                    {check.status.toUpperCase()}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </section>

            {/* ── Footer ── */}
            <footer className="px-8 py-6 border-t border-[#222222]">
                <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[#666666]">
                    PAGE AUTO-REFRESHES EVERY 60 SECONDS
                </p>
            </footer>
        </main>
    );
}
