import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type ComponentStatus = "operational" | "degraded" | "outage";

export interface HealthCheck {
    name: string;
    status: ComponentStatus;
    latencyMs: number;
}

export interface HealthReport {
    status: ComponentStatus;
    checks: HealthCheck[];
    timestamp: string;
}

const CHECK_TIMEOUT_MS = 5_000;

/**
 * Runs a promise with a hard timeout.
 * Returns the fallback value if the promise doesn't resolve in time.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
    });

    try {
        const result = await Promise.race([promise, timeout]);
        return result;
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

async function checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();

    const fallback: HealthCheck = {
        name: "database",
        status: "outage",
        latencyMs: CHECK_TIMEOUT_MS,
    };

    return withTimeout(
        (async (): Promise<HealthCheck> => {
            const t = start;
            try {
                const admin = createSupabaseAdminClient();
                // Lightweight ping: count 0 rows, no data returned
                const { error } = await admin
                    .from("publishers")
                    .select("id", { count: "exact", head: true });

                if (error) {
                    return { name: "database", status: "outage", latencyMs: Date.now() - t };
                }

                return { name: "database", status: "operational", latencyMs: Date.now() - t };
            } catch {
                return { name: "database", status: "outage", latencyMs: Date.now() - t };
            }
        })(),
        CHECK_TIMEOUT_MS,
        fallback,
    );
}

async function checkIngest(): Promise<HealthCheck> {
    const start = Date.now();

    const fallback: HealthCheck = {
        name: "analytics_ingest",
        status: "outage",
        latencyMs: CHECK_TIMEOUT_MS,
    };

    return withTimeout(
        (async (): Promise<HealthCheck> => {
            const t = start;
            try {
                const res = await fetch(`${env.INGEST_BASE_URL}/health`, {
                    method: "HEAD",
                    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
                });

                if (!res.ok) {
                    return { name: "analytics_ingest", status: "degraded", latencyMs: Date.now() - t };
                }

                return { name: "analytics_ingest", status: "operational", latencyMs: Date.now() - t };
            } catch {
                return { name: "analytics_ingest", status: "outage", latencyMs: Date.now() - t };
            }
        })(),
        CHECK_TIMEOUT_MS,
        fallback,
    );
}

function deriveOverallStatus(checks: HealthCheck[]): ComponentStatus {
    const statuses = checks.map((c) => c.status);

    if (statuses.every((s) => s === "operational")) return "operational";
    if (statuses.every((s) => s === "outage")) return "outage";
    return "degraded";
}

/**
 * Runs all health checks in parallel and returns a consolidated report.
 * Safe to call from server components and API routes.
 * Never throws — all errors are captured in the checks array.
 */
export async function runHealthChecks(): Promise<HealthReport> {
    const checks = await Promise.all([checkDatabase(), checkIngest()]);
    const status = deriveOverallStatus(checks);

    return {
        status,
        checks,
        timestamp: new Date().toISOString(),
    };
}
