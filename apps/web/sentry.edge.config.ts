import * as Sentry from "@sentry/nextjs";

/**
 * Sentry Edge runtime configuration.
 *
 * Used by Next.js middleware and any route segments with `export const runtime = "edge"`.
 * The edge runtime has a restricted API surface — no Node.js built-ins.
 */
Sentry.init({
    dsn: process.env['SENTRY_DSN'],

    tracesSampleRate: process.env['NODE_ENV'] === "production" ? 0.1 : 1.0,

    enabled: process.env['NODE_ENV'] === "production",
});
