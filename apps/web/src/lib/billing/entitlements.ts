import { apiError } from "@/lib/api/errors";
import { effectivePlan, PLAN_DISPLAY_NAMES, PLAN_LIMITS, type PlanLimitKey } from "@/lib/billing/enforce";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * The plan a publisher is entitled to RIGHT NOW (via the org they own), with the
 * expiry check applied. Free when they have no org or the paid period lapsed.
 */
export async function resolvePublisherPlan(
    admin: Admin,
    publisherId: string,
): Promise<"free" | "pro" | "enterprise"> {
    const { data: org } = await admin
        .from("organizations")
        .select("plan, subscription_status, current_period_end")
        .eq("owner_id", publisherId)
        .maybeSingle();
    if (!org) return "free";
    return effectivePlan(org);
}

/**
 * Gate a paid boolean feature (e.g. advancedAnalytics, remoteConfig). Returns an
 * error Response to return if the publisher's live plan lacks it, or null if
 * allowed. Server-side enforcement — the UI gate is advisory only.
 */
export async function requireFeature(
    admin: Admin,
    publisherId: string,
    feature: PlanLimitKey,
): Promise<ReturnType<typeof apiError> | null> {
    const plan = await resolvePublisherPlan(admin, publisherId);
    if (PLAN_LIMITS[plan][feature] === true) return null;

    // Lowest plan that has the feature, for a useful upgrade message.
    const needed = PLAN_LIMITS.pro[feature] === true ? "pro" : "enterprise";
    return apiError(
        "UPGRADE_REQUIRED",
        `This feature needs the ${PLAN_DISPLAY_NAMES[needed]} plan.`,
        402,
        { feature, requiredPlan: needed, currentPlan: plan },
    );
}
