import { Hono } from "hono";
import { z } from "zod";

import type { Env, EventsBatchRequest } from "../types";
import { validateApiKey } from "../middleware/api-key";
import { checkRateLimit } from "../durable-objects/rate-limiter";
import { dedupEvents } from "../middleware/dedup";
import { withDb } from "../db/client";

const eventsRouter = new Hono<{ Bindings: Env }>();

const eventSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    walletHash: z
        .string()
        .length(64)
        .regex(/^[0-9a-f]+$/, "walletHash must be a lowercase hex SHA-256"),
    sessionId: z.string().optional(),
    properties: z.record(z.unknown()).optional(),
    sdkVersion: z.string().optional(),
    appVersion: z.string().optional(),
    platform: z.string().optional(),
    isSeeker: z.boolean().optional(),
    hasGenesisToken: z.boolean().optional(),
    skrBalanceTier: z.enum(["none", "low", "medium", "high"]).optional(),
    timestamp: z.number().int().positive(),
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

    // 2. Validate API key (KV lookup)
    const keyValidation = await validateApiKey(apiKey, appId, c.env.API_KEYS_KV);
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

    // 5. Batch write to Supabase via Hyperdrive
    try {
        await writeEventsToSupabase(accepted, appId, c.env);
    } catch (err) {
        console.error("[ingest] Failed to write events:", err);
        return c.json(
            { error: { code: "WRITE_FAILED", message: "Failed to persist events" } },
            500,
        );
    }

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
            values.push(
                event.id,                                          // id (UUID — client generated)
                appId,                                             // app_id
                event.name,                                        // name
                event.walletHash,                                  // wallet_hash (already SHA-256)
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
