import { Hono } from "hono";
import { z } from "zod";

import type { Env, EventsBatchRequest } from "../types";
import { validateApiKey } from "../middleware/api-key";
import { checkRateLimit } from "../durable-objects/rate-limiter";
import { checkQuota } from "../durable-objects/monthly-quota";
import { dedupEvents, markEventsSeen } from "../middleware/dedup";
import { withDb } from "../db/client";

const eventsRouter = new Hono<{ Bindings: Env }>();

// NOTE: every optional field uses `.nullish()` (accepts the value, `null`, OR
// absent) — NOT `.optional()` (which rejects an explicit `null`). The SDK sends
// these fields as explicit `null` when there's no value (e.g. app_open before a
// wallet connects), so `.optional()` 400'd every real event. A 4xx is dropped
// silently by the SDK, so that mismatch made analytics vanish with no error.
const eventSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    // A 64-char lowercase-hex wallet hash, OR empty / null / absent for an
    // anonymous event. Empty/absent is normalised to NULL on write, so distinct
    // wallet metrics (COUNT DISTINCT wallet_hash) ignore anonymous events.
    walletHash: z
        .union([
            z.string().length(64).regex(/^[0-9a-f]+$/, "walletHash must be a lowercase hex SHA-256"),
            z.literal(""),
        ])
        .nullish(),
    sessionId: z.string().nullish(),
    properties: z.record(z.unknown()).nullish(),
    sdkVersion: z.string().nullish(),
    appVersion: z.string().nullish(),
    platform: z.string().nullish(),
    isSeeker: z.boolean().nullish(),
    hasGenesisToken: z.boolean().nullish(),
    skrBalanceTier: z.enum(["none", "low", "medium", "high"]).nullish(),
    // Accept epoch milliseconds (number) OR an ISO-8601 string — the SDK sends
    // ISO strings (`new Date().toISOString()`). The number form is bounded to the
    // max representable JS Date (ms) so an out-of-range value can't throw
    // RangeError at `new Date(...).toISOString()` and poison the whole batch.
    timestamp: z.union([
        z.number().int().positive().max(8_640_000_000_000_000),
        z.string().datetime(),
    ]),
});

const batchSchema = z.object({
    apiKey: z.string().min(1),
    appId: z.string().uuid(),
    events: z.array(eventSchema).min(1).max(200),
});

eventsRouter.post("/", async (c) => {
    let body: unknown;
    try {
        body = await c.req.json<EventsBatchRequest>();
    } catch {
        return c.json(
            { error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
            400,
        );
    }

    // 1. Validate schema
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
        return c.json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Invalid event batch",
                    details: parsed.error.flatten().fieldErrors,
                },
            },
            400,
        );
    }

    const { apiKey, appId, events } = parsed.data;

    // 2. Validate API key (KV lookup, DB read-through on cache miss)
    let keyValidation;
    try {
        keyValidation = await validateApiKey(apiKey, appId, c.env);
    } catch {
        // The key check itself failed on a DB/infra error (not a verdict that the
        // key is bad). Return a retryable 5xx so the SDK re-queues — a 401 here
        // would make the SDK drop the batch permanently on a transient hiccup.
        return c.json(
            { error: { code: "VALIDATION_UNAVAILABLE", message: "Key validation temporarily unavailable" } },
            503,
        );
    }
    if (!keyValidation.valid) {
        return c.json(
            { error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } },
            401,
        );
    }

    // 3. Rate limiting (Durable Object per API key)
    const rateLimitOk = await checkRateLimit(keyValidation.publisherId, c.env.RATE_LIMITER);
    if (!rateLimitOk) {
        return c.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests" } },
            429,
        );
    }

    // 4. Deduplication (KV, 24h TTL per event UUID)
    const { accepted, rejected } = await dedupEvents(events, c.env.EVENT_DEDUP_KV);

    if (accepted.length === 0) {
        return c.json({ accepted: 0, rejected: rejected.length });
    }

    // 4b. Monthly events quota (per publisher, by plan). Unlimited plans (-1) skip it.
    if (keyValidation.eventsLimit >= 0) {
        const within = await checkQuota(
            keyValidation.publisherId,
            accepted.length,
            keyValidation.eventsLimit,
            c.env.MONTHLY_QUOTA,
        );
        if (!within) {
            return c.json(
                {
                    error: {
                        code: "QUOTA_EXCEEDED",
                        message: "Monthly events limit reached. Upgrade your plan for more.",
                    },
                },
                429,
            );
        }
    }

    // 5. Batch write to Supabase via Hyperdrive
    try {
        await writeEventsToSupabase(accepted, appId, c.env);
    } catch (err) {
        console.error("[ingest] Failed to write events:", err);
        // Do NOT mark these events seen — let the SDK retry the batch.
        return c.json(
            { error: { code: "WRITE_FAILED", message: "Failed to persist events" } },
            500,
        );
    }

    // 6. Only AFTER a durable write, record the dedup markers so SDK retries are
    //    deduped. waitUntil keeps the KV writes alive past the response without
    //    blocking it (and without the fire-and-forget data-loss risk of `void`).
    c.executionCtx.waitUntil(markEventsSeen(accepted, c.env.EVENT_DEDUP_KV));

    return c.json({ accepted: accepted.length, rejected: rejected.length });
});

function writeEventsToSupabase(
    events: z.infer<typeof eventSchema>[],
    appId: string,
    env: Env,
): Promise<void> {
    return withDb(env, async (client) => {
        // Build a single parameterised INSERT for the entire batch.
        // TimescaleDB partitions by timestamp — always include it.
        const values: unknown[] = [];
        const placeholders: string[] = [];

        events.forEach((event, i) => {
            const base = i * 12;
            // Build "$N, $N+1, ..." using String() to satisfy restrict-template-expressions
            const row = Array.from({ length: 12 }, (_, j) => "$" + String(base + j + 1)).join(", ");
            placeholders.push("(" + row + ")");
            // Anonymous events (no wallet yet) arrive as "" or null — store NULL so
            // they count toward total events but not toward distinct-wallet metrics.
            const walletHash =
                event.walletHash && event.walletHash.length === 64 ? event.walletHash : null;
            values.push(
                event.id,                                          // id (UUID — client generated)
                appId,                                             // app_id
                event.name,                                        // name
                walletHash,                                        // wallet_hash (SHA-256 or NULL)
                event.sessionId ?? null,                           // session_id
                event.properties ? JSON.stringify(event.properties) : null, // properties (JSONB)
                event.sdkVersion ?? null,                          // sdk_version
                event.appVersion ?? null,                          // app_version
                event.platform ?? null,                            // platform
                event.isSeeker ?? null,                            // is_seeker
                event.hasGenesisToken ?? null,                     // has_genesis_token
                new Date(event.timestamp).toISOString(),           // timestamp (partition key)
            );
        });

        await client.query(
            `INSERT INTO analytics_events
         (id, app_id, name, wallet_hash, session_id, properties,
          sdk_version, app_version, platform, is_seeker, has_genesis_token, timestamp)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT DO NOTHING`,
            values,
        );
    });
}

export { eventsRouter };
