import { env } from "@/lib/env";

/**
 * Authenticates a cron / internal HTTP route. Fails CLOSED:
 *  - if `CRON_SECRET` is not configured, the route is unusable (503) rather than
 *    running open — a misconfiguration must never expose a destructive endpoint;
 *  - otherwise the caller must present `Authorization: Bearer <CRON_SECRET>`.
 *
 * Returns an error `Response` to short-circuit with, or `null` when authorized.
 *
 * Invoked by every /api/v1/cron/* route. The legitimate callers (Vercel Cron and
 * the Telegram admin `/trigger` self-call) both send the bearer; pg_cron drives
 * its own SQL jobs directly and does not hit these HTTP routes.
 */
export function requireCronAuth(request: Request): Response | null {
    const secret = env.CRON_SECRET;
    if (!secret) {
        return new Response("Cron not configured", { status: 503 });
    }
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
        return new Response("Unauthorized", { status: 401 });
    }
    return null;
}
