/**
 * Base URL of the Canopy web API the tester app talks to. Set
 * EXPO_PUBLIC_CANOPY_API_URL in .env; defaults to localhost for dev.
 *
 * NOTE: on a physical device, `localhost` points at the device, not your Mac —
 * set EXPO_PUBLIC_CANOPY_API_URL to your machine's LAN IP (or a tunnel) when
 * testing against a local web server.
 *
 * IMPORTANT: read `process.env.EXPO_PUBLIC_*` DIRECTLY here. Expo only inlines
 * these values into a release bundle when it sees the literal
 * `process.env.EXPO_PUBLIC_…` member access. If you alias process.env to another
 * variable first and read from that, nothing gets inlined: it works in dev (dev
 * ships a runtime process.env) but in a release build every value is undefined,
 * so the API URL silently falls back to localhost and analytics get empty keys.
 * Types for these vars live in env.d.ts.
 */
export const API_BASE_URL = (
    process.env.EXPO_PUBLIC_CANOPY_API_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/** The Canopy app's own analytics config (optional — for tracking the tester app itself). */
export const CANOPY_ANALYTICS = {
    apiKey: process.env.EXPO_PUBLIC_CANOPY_API_KEY ?? "",
    appId: process.env.EXPO_PUBLIC_CANOPY_APP_ID ?? "",
    appVersion: "0.1.0",
    // Strip any trailing slash — the SDK appends "/v1/events", so a trailing
    // slash here would POST to "…//v1/events", which 404s.
    ...(process.env.EXPO_PUBLIC_CANOPY_INGEST_URL
        ? { ingestUrl: process.env.EXPO_PUBLIC_CANOPY_INGEST_URL.replace(/\/+$/, "") }
        : {}),
};
