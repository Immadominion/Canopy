// Ambient types for the EXPO_PUBLIC_ env vars this app reads.
//
// We must read process.env.EXPO_PUBLIC_* DIRECTLY (never aliased through another
// variable) so Expo inlines the values into release builds. This declaration
// keeps that direct access typed as `string | undefined` instead of `any`.
declare namespace NodeJS {
    interface ProcessEnv {
        EXPO_PUBLIC_CANOPY_API_URL?: string;
        EXPO_PUBLIC_CANOPY_API_KEY?: string;
        EXPO_PUBLIC_CANOPY_APP_ID?: string;
        EXPO_PUBLIC_CANOPY_INGEST_URL?: string;
    }
}
