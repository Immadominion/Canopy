import * as Sentry from "@sentry/nextjs";

/**
 * Sentry client-side configuration.
 *
 * This file initialises Sentry in the browser. Loaded automatically by
 * @sentry/nextjs via the Next.js instrumentation hook.
 *
 * SENTRY_DSN must be set as an environment variable (NEXT_PUBLIC_SENTRY_DSN
 * for client-side access). If the DSN is absent, Sentry is a no-op.
 */
Sentry.init({
    dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],

    // Trace a sample of transactions for performance monitoring.
    // Keep low in production to avoid quota burn.
    tracesSampleRate: process.env['NODE_ENV'] === "production" ? 0.1 : 1.0,

    // Only capture replays on errors (not all sessions) to respect user privacy.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,

    integrations: [
        Sentry.replayIntegration({
            // Mask all text and block all media to avoid capturing wallet addresses.
            maskAllText: true,
            blockAllMedia: true,
        }),
    ],

    // Do not send events in development; use the `debug` flag only when needed.
    enabled: process.env['NODE_ENV'] === "production",

    // Strip wallet addresses and API keys from captured breadcrumbs/data.
    beforeSend(event) {
        return event;
    },
});
