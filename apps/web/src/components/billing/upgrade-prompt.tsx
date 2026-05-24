import Link from "next/link";

import { PLAN_DISPLAY_NAMES } from "@/lib/billing/enforce";

interface UpgradePromptProps {
    /** Human-readable feature name, e.g. "API keys" */
    feature: string;
    /** The plan the org is currently on */
    currentPlan: "free" | "pro" | "enterprise";
    /** The minimum plan that unlocks this feature */
    requiredPlan: "free" | "pro" | "enterprise";
    /** Numeric limit on the current plan — shown in the message (omit for boolean features) */
    currentLimit?: number;
    /** Descriptive copy shown under the limit notice */
    description?: string;
}

/**
 * Upgrade prompt shown when a user hits a plan tier limit.
 *
 * Nothing Design:
 * - Accent red (--color-accent) for the limit badge — ONE interrupt per screen
 * - Space Mono label + counter
 * - Flat, no shadow, subtle border
 */
export function UpgradePrompt({
    feature,
    currentPlan,
    requiredPlan,
    currentLimit,
    description,
}: UpgradePromptProps) {
    const currentPlanName = PLAN_DISPLAY_NAMES[currentPlan];
    const requiredPlanName = PLAN_DISPLAY_NAMES[requiredPlan];

    return (
        <div
            className="border border-[#D71921]/40 bg-[#D71921]/5 rounded-sm p-4 flex flex-col gap-3"
            role="alert"
            aria-label={`${feature} limit reached`}
        >
            {/* Label row */}
            <div className="flex items-center gap-2">
                <span
                    className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#D71921] bg-[#D71921]/10 px-1.5 py-0.5 rounded-sm"
                    aria-hidden="true"
                >
                    LIMIT REACHED
                </span>
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--text-secondary)]">
                    {currentPlanName} plan
                </span>
            </div>

            {/* Primary copy */}
            <p className="font-sans text-sm text-[var(--text-primary)]">
                {currentLimit !== undefined ? (
                    <>
                        Your <span className="font-semibold">{currentPlanName}</span> plan includes up to{" "}
                        <span className="font-mono text-[#D71921]">{currentLimit}</span> {feature.toLowerCase()}.
                    </>
                ) : (
                    <>
                        <span className="font-semibold">{feature}</span> is not available on the {currentPlanName} plan.
                    </>
                )}{" "}
                {description}
            </p>

            {/* Upgrade CTA */}
            <div className="flex items-center gap-3">
                <Link
                    href="/dashboard/billing"
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] uppercase text-[#000000] bg-[var(--text-primary)] hover:bg-[var(--text-secondary)] px-3 py-1.5 rounded-sm transition-colors"
                >
                    Upgrade to {requiredPlanName}
                    <span aria-hidden="true">→</span>
                </Link>
                <span className="font-mono text-[10px] tracking-[0.06em] text-[var(--text-tertiary)]">
                    {requiredPlanName.toUpperCase()} · UNLOCK MORE {feature.toUpperCase()}
                </span>
            </div>
        </div>
    );
}
