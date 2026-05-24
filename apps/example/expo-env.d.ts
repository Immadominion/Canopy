// expo-env.d.ts — declares EXPO_PUBLIC_* environment variables for TypeScript.
// Metro replaces these at bundle time; this file provides compile-time types.
// Do not edit the variable names — they must match the .env file exactly.

declare const process: {
    env: {
        readonly EXPO_PUBLIC_CANOPY_API_KEY: string | undefined;
        readonly EXPO_PUBLIC_CANOPY_APP_ID: string | undefined;
        readonly EXPO_PUBLIC_CANOPY_INGEST_URL: string | undefined;
    };
};
