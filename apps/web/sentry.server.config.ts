import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server-side (Node.js runtime) configuration.
 *
 * Initialised via apps/web/instrumentation.ts when the Next.js server starts.
 * Captures unhandled exceptions and slow server-side renders.
 */
Sentry.init({
    dsn: process.env['SENTRY_DSN'],

    tracesSampleRate: process.env['NODE_ENV'] === "production" ? 0.1 : 1.0,

    enabled: process.env['NODE_ENV'] === "production",

    // Prevent sensitive data from reaching Sentry.
    // Wallet addresses and API keys must never appear in error reports.
    beforeSend(event) {
        // Strip authorization headers from request data
        if (event.request?.headers) {
            const headers = event.request.headers as Record<string, string>;
            if ("authorization" in headers) {
                headers["authorization"] = "[REDACTED]";
            }
        }
        return event;
    },
});
