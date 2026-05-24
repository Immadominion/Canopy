/**
 * Next.js instrumentation file.
 *
 * This is the entry point for Sentry in both the Node.js and Edge runtimes.
 * Next.js calls `register()` once when the server starts.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
    if (process.env['NEXT_RUNTIME'] === "nodejs") {
        await import("../sentry.server.config");
    }

    if (process.env['NEXT_RUNTIME'] === "edge") {
        await import("../sentry.edge.config");
    }
}

/**
 * Sentry error handler for React Server Component errors.
 * Forwards RSC errors to Sentry before Next.js renders the error boundary.
 * Note: onRequestError was introduced in @sentry/nextjs v8+ — when upgrading,
 * uncomment: export { onRequestError } from "@sentry/nextjs";
 */
