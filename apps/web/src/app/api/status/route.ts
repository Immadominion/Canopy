import { runHealthChecks } from "@/lib/health/checks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/status
 *
 * Public-facing status endpoint. Returns a simplified view of system health
 * with no internal details (no latency numbers, no error messages).
 *
 * No authentication required — safe to call from external monitors and
 * embed in status pages.
 *
 * Response 200 (operational or degraded):
 *   {
 *     status: "operational" | "degraded",
 *     components: [{ name: string, status: string }],
 *     timestamp: string
 *   }
 *
 * Response 503 (outage):
 *   { status: "outage", components: [...], timestamp: string }
 *
 * Uptime monitors should treat any non-2xx or non-3xx response as a failure.
 */
export async function GET(): Promise<Response> {
    const report = await runHealthChecks();

    const body = {
        status: report.status,
        components: report.checks.map((c) => ({
            name: c.name,
            status: c.status,
        })),
        timestamp: report.timestamp,
    };

    // 503 on full outage so monitoring services detect it as a down event
    const httpStatus = report.status === "outage" ? 503 : 200;

    return Response.json(body, { status: httpStatus });
}
