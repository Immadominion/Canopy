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

// Deliberately cheap. Adjust freely — the only constraint is that the /pricing
// page, the billing page, and these numbers stay in sync (all read from here).
export const PLAN_PRICES: Record<PaidPlan, PlanPrice> = {
    pro: { monthlyUsd: 9, annualUsd: 90 }, // 2 months free annually
    enterprise: { monthlyUsd: 49, annualUsd: 490 },
};

export const PERIOD_DAYS: Record<BillingInterval, number> = {
    monthly: 30,
    annual: 365,
};

export function priceUsd(plan: PaidPlan, interval: BillingInterval): number {
    return interval === "annual" ? PLAN_PRICES[plan].annualUsd : PLAN_PRICES[plan].monthlyUsd;
}

/**
 * Price in USDC base units (6 decimals) for a plan + interval. Decimal-safe via
 * integer cents, so a price like 4.99 works (BigInt rejects non-integers).
 */
export function priceBaseUnits(plan: PaidPlan, interval: BillingInterval): bigint {
    const cents = BigInt(Math.round(priceUsd(plan, interval) * 100));
    return cents * 10n ** BigInt(USDC_DECIMALS - 2);
}

export function isPaidPlan(value: string): value is PaidPlan {
    return value === "pro" || value === "enterprise";
}

export function isBillingInterval(value: string): value is BillingInterval {
    return value === "monthly" || value === "annual";
}
