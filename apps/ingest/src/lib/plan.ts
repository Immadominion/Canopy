/**
 * Monthly analytics event limit per plan.
 *
 * Keep these in sync with PLAN_LIMITS.eventsPerMonth in
 * apps/web/src/lib/billing/enforce.ts. -1 means unlimited.
 */
const EVENTS_PER_MONTH: Record<"free" | "pro" | "enterprise", number> = {
    free: 1_000_000,
    pro: 10_000_000,
    enterprise: -1,
};

export interface OrgPlanRow {
    plan: string | null;
    subscription_status: string | null;
    current_period_end: string | null;
}

/**
 * The org's live plan, with the expiry check applied. A paid plan only counts
 * while it is active and the paid period has not lapsed. Mirrors
 * effectivePlan() on the web side.
 */
export function effectivePlan(org: OrgPlanRow | null): "free" | "pro" | "enterprise" {
    if (!org) return "free";
    const plan = org.plan;
    if (plan !== "pro" && plan !== "enterprise") return "free";
    if (org.subscription_status !== "active") return "free";
    const end = org.current_period_end ? new Date(org.current_period_end).getTime() : 0;
    if (!end || end <= Date.now()) return "free";
    return plan;
}

/** The effective monthly events limit for an org (-1 = unlimited). */
export function effectiveEventsLimit(org: OrgPlanRow | null): number {
    return EVENTS_PER_MONTH[effectivePlan(org)];
}
