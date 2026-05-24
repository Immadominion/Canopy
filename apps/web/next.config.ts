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
                            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://mainnet.helius-rpc.com https://sentry.io https://*.sentry.io",
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
    disableLogger: true,

    // Do not automatically instrument server components — we use manual spans
    // in the routes that need it.
    autoInstrumentServerFunctions: false,
    autoInstrumentAppDirectory: true,
    autoInstrumentMiddleware: true,

    // Suppress source map upload when auth token is absent (local dev)
    sourcemaps: {
        disable: !process.env['SENTRY_AUTH_TOKEN'],
    },
});
