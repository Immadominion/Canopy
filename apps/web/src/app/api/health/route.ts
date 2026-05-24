import type { NextRequest } from "next/server";

import { runHealthChecks } from "@/lib/health/checks";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Internal health check endpoint. Reports the status of all critical
 * dependencies: Supabase database and the analytics ingest service.
 *
 * Authentication:
 *   Requires `Authorization: Bearer {HEALTH_TOKEN}` in production.
 *   In development, no token is required.
 *
 * Response 200:
 *   { status: "operational"|"degraded"|"outage", checks: [...], timestamp }
 *
 * This endpoint is intended for:
 *   - External uptime monitoring services (Better Stack, Checkly, etc.)
 *   - Internal alerting pipelines
 *   - CI/CD readiness checks
 */
export async function GET(request: NextRequest): Promise<Response> {
    // ── Auth: require HEALTH_TOKEN in production ───────────────────────────
    if (env.NODE_ENV === "production" && env.HEALTH_TOKEN) {
        const authHeader = request.headers.get("authorization");
        if (authHeader !== `Bearer ${env.HEALTH_TOKEN}`) {
            return new Response("Unauthorized", { status: 401 });
        }
    }

    const report = await runHealthChecks();

    // HTTP 200 for operational/degraded; 503 for full outage
    const httpStatus = report.status === "outage" ? 503 : 200;

    return Response.json(report, { status: httpStatus });
}
