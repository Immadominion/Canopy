/**
 * POST /api/v1/cron/webhooks
 *
 * Cron job — processes pending webhook deliveries.
 * Called every minute by pg_cron via pg_net. Also callable by Vercel Cron.
 *
 * Security: checks Authorization: Bearer {CRON_SECRET}.
 *
 * Delivery algorithm:
 *   1. Fetch up to 50 pending deliveries with next_attempt_at <= now().
 *   2. For each delivery, fetch the endpoint (service_role for signing_secret).
 *   3. Compute HMAC-SHA256 signature over JSON payload.
 *   4. POST to endpoint URL with 10s timeout.
 *   5. On success (2xx): mark delivered.
 *   6. On failure: increment attempts, apply exponential backoff, mark failed at 5 attempts.
 */
import { createHmac } from "crypto";
import { type NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Exponential backoff delays (in seconds) per attempt number (1-indexed)
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200]; // 30s, 2m, 10m, 30m, 2h
const MAX_ATTEMPTS = 5;
const DELIVERY_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 50;

function computeSignature(secret: string, payload: string): string {
    return "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
}

function nextAttemptAt(attempts: number): string {
    const delaySeconds = BACKOFF_SECONDS[attempts] ?? BACKOFF_SECONDS[BACKOFF_SECONDS.length - 1] ?? 7200;
    return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    // Verify CRON_SECRET if set (required in production)
    const cronSecret = env.CRON_SECRET;
    if (cronSecret) {
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (token !== cronSecret) {
            return apiError("UNAUTHORIZED", "Invalid cron secret", 401);
        }
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Fetch batch of pending deliveries
    const { data: deliveries, error: fetchError } = await supabase
        .from("webhook_deliveries")
        .select("id, endpoint_id, event_type, payload, attempts")
        .eq("status", "pending")
        .lte("next_attempt_at", now)
        .order("next_attempt_at", { ascending: true })
        .limit(BATCH_SIZE);

    if (fetchError) {
        return apiError("DB_ERROR", "Failed to fetch pending deliveries", 500);
    }

    if (!deliveries || deliveries.length === 0) {
        return NextResponse.json({ processed: 0 });
    }

    // Collect unique endpoint IDs and fetch them (includes signing_secret)
    const endpointIds = [...new Set(deliveries.map((d) => d.endpoint_id))];
    const { data: endpoints, error: endpointError } = await supabase
        .from("webhook_endpoints")
        .select("id, url, signing_secret, enabled")
        .in("id", endpointIds);

    if (endpointError) {
        return apiError("DB_ERROR", "Failed to fetch webhook endpoints", 500);
    }

    const endpointMap = new Map(
        (endpoints ?? []).map((e) => [e.id, e]),
    );

    let processed = 0;

    for (const delivery of deliveries) {
        const endpoint = endpointMap.get(delivery.endpoint_id);
        if (!endpoint || !endpoint.enabled) {
            // Skip disabled or missing endpoints — mark failed immediately
            await supabase
                .from("webhook_deliveries")
                .update({ status: "failed", last_error: "Endpoint disabled or not found" })
                .eq("id", delivery.id);
            continue;
        }

        const payloadJson = JSON.stringify(delivery.payload);
        const signature = computeSignature(endpoint.signing_secret, payloadJson);

        let httpStatus: number | null = null;
        let lastError: string | null = null;
        let success = false;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

            const res = await fetch(endpoint.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Canopy-Signature": signature,
                    "X-Canopy-Event": delivery.event_type,
                    "User-Agent": "Canopy-Webhooks/1.0",
                },
                body: payloadJson,
                signal: controller.signal,
            });

            clearTimeout(timeout);
            httpStatus = res.status;
            success = res.ok;
            if (!res.ok) {
                lastError = `HTTP ${String(res.status)}`;
            }
        } catch (err) {
            lastError = err instanceof Error ? err.message : "Network error";
        }

        const newAttempts = delivery.attempts + 1;

        if (success) {
            await supabase
                .from("webhook_deliveries")
                .update({
                    status: "delivered",
                    attempts: newAttempts,
                    last_http_status: httpStatus,
                    delivered_at: new Date().toISOString(),
                    last_error: null,
                })
                .eq("id", delivery.id);
        } else if (newAttempts >= MAX_ATTEMPTS) {
            await supabase
                .from("webhook_deliveries")
                .update({
                    status: "failed",
                    attempts: newAttempts,
                    last_http_status: httpStatus,
                    last_error: lastError,
                })
                .eq("id", delivery.id);
        } else {
            await supabase
                .from("webhook_deliveries")
                .update({
                    status: "pending",
                    attempts: newAttempts,
                    last_http_status: httpStatus,
                    last_error: lastError,
                    next_attempt_at: nextAttemptAt(newAttempts),
                })
                .eq("id", delivery.id);
        }

        processed++;
    }

    return NextResponse.json({ processed });
}
