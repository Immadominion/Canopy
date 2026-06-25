import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Strict mode for better React practices
    reactStrictMode: true,

    // Security headers
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                    {
                        key: "Content-Security-Policy",
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-eval in dev
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            "font-src 'self' https://fonts.gstatic.com",
                            "img-src 'self' data: blob:",
                            // R2 (*.r2.cloudflarestorage.com) is needed for the browser's
                            // direct-to-R2 presigned APK upload (PUT). Wildcard avoids
                            // hardcoding the R2 account id in this public repo.
                            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://mainnet.helius-rpc.com https://sentry.io https://*.sentry.io https://*.r2.cloudflarestorage.com",
                            "frame-ancestors 'none'",
                        ].join("; "),
                    },
                ],
            },
        ];
    },

    // Transpile workspace packages
    transpilePackages: ["@canopy/types", "@canopy/utils"],
};

export default withSentryConfig(nextConfig, {
    // Suppress source-map upload in environments without a SENTRY_AUTH_TOKEN.
    // Upload is enabled in CI via the SENTRY_AUTH_TOKEN env var.
    silent: !process.env['SENTRY_AUTH_TOKEN'],

    // Suppress source map upload when auth token is absent (local dev)
    sourcemaps: {
        disable: !process.env['SENTRY_AUTH_TOKEN'],
    },

    // Webpack-build instrumentation options. These moved under `webpack` in
    // newer @sentry/nextjs (the top-level forms were deprecated and warned on
    // every dev boot). They are no-ops under Turbopack, which we use in dev.
    webpack: {
        autoInstrumentServerFunctions: false,
        autoInstrumentAppDirectory: true,
        autoInstrumentMiddleware: true,
        treeshake: {
            removeDebugLogging: true,
        },
    },
});
