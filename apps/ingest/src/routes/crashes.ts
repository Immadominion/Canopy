import { Hono } from "hono";
import { z } from "zod";

import type { Env, CrashReportRequest } from "../types";
import { validateApiKey } from "../middleware/api-key";
import { withDb } from "../db/client";

const crashesRouter = new Hono<{ Bindings: Env }>();

const crashSchema = z.object({
    apiKey: z.string().min(1),
    appId: z.string().uuid(),
    fingerprint: z.string().min(1).max(64),
    errorMessage: z.string().max(2000),
    stackTrace: z.string().max(50000),
    walletHash: z
        .string()
        .length(64)
        .regex(/^[0-9a-f]+$/)
        .optional(),
    appVersion: z.string().optional(),
    sdkVersion: z.string().optional(),
    deviceModel: z.string().optional(),
    androidVersion: z.string().optional(),
    lastEvents: z.array(z.unknown()).max(5).optional(),
    walletContext: z.record(z.unknown()).optional(),
    timestamp: z.number().int().positive(),
});

crashesRouter.post("/", async (c) => {
    let body: unknown;
    try {
        body = await c.req.json<CrashReportRequest>();
    } catch {
        return c.json(
            { error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
            400,
        );
    }

    const parsed = crashSchema.safeParse(body);
    if (!parsed.success) {
        return c.json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Invalid crash report",
                    details: parsed.error.flatten().fieldErrors,
                },
            },
            400,
        );
    }

    const { apiKey, appId } = parsed.data;

    const keyValidation = await validateApiKey(apiKey, appId, c.env);
    if (!keyValidation.valid) {
        return c.json(
            { error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } },
            401,
        );
    }

    // Upsert crash report with fingerprint-based deduplication.
    // Same fingerprint = same crash issue. Increment occurrence_count, update last_seen_at.
    // New fingerprint = new crash issue.
    try {
        await withDb(c.env, async (client) => {
            await client.query(
                `INSERT INTO crash_reports
           (app_id, fingerprint, error_message, stack_trace, wallet_hash,
            app_version, sdk_version, device_model, android_version,
            last_events, wallet_context, first_seen_at, last_seen_at, occurrence_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now(), 1)
         ON CONFLICT (app_id, fingerprint)
         DO UPDATE SET
           occurrence_count = crash_reports.occurrence_count + 1,
           last_seen_at     = now(),
           wallet_hash      = COALESCE(EXCLUDED.wallet_hash, crash_reports.wallet_hash)`,
                [
                    appId,
                    parsed.data.fingerprint,
                    parsed.data.errorMessage,
                    parsed.data.stackTrace,
                    parsed.data.walletHash ?? null,
                    parsed.data.appVersion ?? null,
                    parsed.data.sdkVersion ?? null,
                    parsed.data.deviceModel ?? null,
                    parsed.data.androidVersion ?? null,
                    parsed.data.lastEvents ? JSON.stringify(parsed.data.lastEvents) : null,
                    parsed.data.walletContext ? JSON.stringify(parsed.data.walletContext) : null,
                ],
            );
        });
    } catch (err) {
        console.error("[ingest] Failed to write crash report:", err);
        return c.json(
            { error: { code: "WRITE_FAILED", message: "Failed to persist crash report" } },
            500,
        );
    }

    return c.json({ received: true });
});

export { crashesRouter };
