import pino from "pino";

/**
 * Server-side structured logger for Canopy.
 *
 * In development: pretty-prints to stdout via pino-dev transport (not installed —
 * falls back to JSON if not present). In production: JSON logs for cloud log
 * ingestion (Vercel / Better Stack / Grafana).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   const log = logger.child({ route: "POST /api/v1/beta/upload" });
 *   log.info({ publisherId }, "APK upload started");
 *   log.error({ err }, "R2 upload failed");
 *
 * Never log plaintext wallet addresses or API keys.
 * Always use wallet_hash instead of wallet_address in log payloads.
 */
export const logger = pino({
    level: process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === "production" ? "info" : "debug"),
    base: {
        service: "canopy-web",
        env: process.env['NODE_ENV'],
    },
    redact: {
        // Strip sensitive fields wherever they appear in log objects
        paths: [
            "wallet_address",
            "walletAddress",
            "*.wallet_address",
            "*.walletAddress",
            "authorization",
            "password",
            "apiKey",
            "api_key",
            "key",
            "secret",
        ],
        censor: "[REDACTED]",
    },
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
    },
});
