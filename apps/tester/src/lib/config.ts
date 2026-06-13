/**
 * Base URL of the Canopy web API the tester app talks to. Set
 * EXPO_PUBLIC_CANOPY_API_URL in .env; defaults to localhost for dev.
 *
 * NOTE: on a physical device, `localhost` points at the device, not your Mac —
 * set EXPO_PUBLIC_CANOPY_API_URL to your machine's LAN IP (or a tunnel) when
 * testing against a local web server.
 */
// Typed view of the Expo public env (avoids `any` from process.env when
// expo-env.d.ts isn't in the lint program's tsconfig include).
const ENV = process.env as Record<string, string | undefined>;

export const API_BASE_URL = (
    ENV.EXPO_PUBLIC_CANOPY_API_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/** The Canopy app's own analytics config (optional — for tracking the tester app itself). */
export const CANOPY_ANALYTICS = {
    apiKey: ENV.EXPO_PUBLIC_CANOPY_API_KEY ?? "",
    appId: ENV.EXPO_PUBLIC_CANOPY_APP_ID ?? "",
    appVersion: "0.1.0",
    ...(ENV.EXPO_PUBLIC_CANOPY_INGEST_URL
        ? { ingestUrl: ENV.EXPO_PUBLIC_CANOPY_INGEST_URL }
        : {}),
};
