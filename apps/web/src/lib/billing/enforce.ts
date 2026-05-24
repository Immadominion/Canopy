/**
 * Plan tier limits for Canopy subscription tiers.
 *
 * These are enforced at:
 *   1. API level — checked before operations that could exceed limits
 *   2. UI level — upgrade prompts shown when at or near limits
 *
 * The 200 tester hard cap is a product invariant separate from billing —
 * it applies to ALL plans and must never be changed.
 */

export interface PlanLimits {
    /** Monthly analytics events. -1 = unlimited. */
    eventsPerMonth: number;
    /** Maximum org members (including owner). -1 = unlimited. */
    maxMembers: number;
    /** Maximum active API keys per org. -1 = unlimited. */
    maxApiKeys: number;
    /** Crash reports per month. -1 = unlimited. */
    crashReportsPerMonth: number;
    /** Days of data retention in analytics_events. */
    dataRetentionDays: number;
    /** Whether advanced analytics (funnels, retention) are available. */
    advancedAnalytics: boolean;
    /** Whether Remote Config is available. */
    remoteConfig: boolean;
}

export const PLAN_LIMITS: Record<"free" | "pro" | "enterprise", PlanLimits> = {
    free: {
        eventsPerMonth: 500_000,
        maxMembers: 1,
        maxApiKeys: 3,
        crashReportsPerMonth: 1_000,
        dataRetentionDays: 30,
        advancedAnalytics: false,
        remoteConfig: false,
    },
    pro: {
        eventsPerMonth: 10_000_000,
        maxMembers: 5,
        maxApiKeys: 20,
        crashReportsPerMonth: -1,
        dataRetentionDays: 90,
        advancedAnalytics: true,
        remoteConfig: true,
    },
    enterprise: {
        eventsPerMonth: -1,
        maxMembers: -1,
        maxApiKeys: -1,
        crashReportsPerMonth: -1,
        dataRetentionDays: 365,
        advancedAnalytics: true,
        remoteConfig: true,
    },
};

export type PlanLimitKey = keyof PlanLimits;

/**
 * Check whether a given numeric usage value is within the plan limit.
 * Returns `true` (allowed) if the limit is -1 (unlimited) or usage < limit.
 */
export function withinLimit(plan: "free" | "pro" | "enterprise", key: PlanLimitKey, current: number): boolean {
    const limits = PLAN_LIMITS[plan];
    const limit = limits[key];
    if (typeof limit !== "number") return true; // boolean feature flag — not a count
    if (limit === -1) return true;
    return current < limit;
}

/**
 * Returns the numeric limit for a plan/key combination.
 * Returns Infinity if the limit is -1 (unlimited) or the key is a boolean flag.
 */
export function getLimit(plan: "free" | "pro" | "enterprise", key: PlanLimitKey): number {
    const limits = PLAN_LIMITS[plan];
    const limit = limits[key];
    if (typeof limit !== "number") return Infinity;
    return limit === -1 ? Infinity : limit;
}

/**
 * Determine which plans unlock a feature.
 * Returns the minimum plan tier required.
 */
export function requiredPlan(key: PlanLimitKey): "free" | "pro" | "enterprise" {
    // If the free plan has the feature enabled (non-zero, non-false), return free.
    const freeLimit = PLAN_LIMITS.free[key];
    if (freeLimit === true || (typeof freeLimit === "number" && freeLimit > 0)) return "free";

    const proLimit = PLAN_LIMITS.pro[key];
    if (proLimit === true || (typeof proLimit === "number" && proLimit > 0)) return "pro";

    return "enterprise";
}

export const PLAN_DISPLAY_NAMES: Record<"free" | "pro" | "enterprise", string> = {
    free: "Free",
    pro: "Pro",
    enterprise: "Enterprise",
};
