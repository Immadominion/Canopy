/**
 * Paid plan pricing for on-chain USDC billing.
 *
 * Prices are advertised globally in USD and charged in USDC (1:1, 6 decimals).
 * No regional pricing — settlement is in USDC, so there is no FX loss.
 */

export type PaidPlan = "pro" | "enterprise";
export type BillingInterval = "monthly" | "annual";

export const USDC_DECIMALS = 6;

interface PlanPrice {
    monthlyUsd: number;
    annualUsd: number; // ~2 months free
}

export const PLAN_PRICES: Record<PaidPlan, PlanPrice> = {
    pro: { monthlyUsd: 29, annualUsd: 290 },
    enterprise: { monthlyUsd: 199, annualUsd: 1990 },
};

export const PERIOD_DAYS: Record<BillingInterval, number> = {
    monthly: 30,
    annual: 365,
};

export function priceUsd(plan: PaidPlan, interval: BillingInterval): number {
    return interval === "annual" ? PLAN_PRICES[plan].annualUsd : PLAN_PRICES[plan].monthlyUsd;
}

/** Price in USDC base units (6 decimals) for a plan + interval. */
export function priceBaseUnits(plan: PaidPlan, interval: BillingInterval): bigint {
    return BigInt(priceUsd(plan, interval)) * 10n ** BigInt(USDC_DECIMALS);
}

export function isPaidPlan(value: string): value is PaidPlan {
    return value === "pro" || value === "enterprise";
}

export function isBillingInterval(value: string): value is BillingInterval {
    return value === "monthly" || value === "annual";
}
