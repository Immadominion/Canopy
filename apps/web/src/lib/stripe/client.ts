/**
 * Stripe client singleton.
 *
 * Import `getStripe()` rather than importing stripe directly — this ensures
 * the client is created lazily (not at module load time) and only once.
 */

import Stripe from "stripe";

import { env } from "@/lib/env";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (!_stripe) {
        _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            apiVersion: "2026-04-22.dahlia",
        });
    }
    return _stripe;
}
