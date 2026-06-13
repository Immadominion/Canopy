import { z } from "zod";

/**
 * Server-side environment variables.
 * Validated at startup — missing vars throw immediately.
 * Never expose these to the client bundle.
 */
const serverEnvSchema = z.object({
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

    // Solana / Helius
    SOLANA_RPC_URL: z.string().url("SOLANA_RPC_URL must be a valid URL"),
    HELIUS_API_KEY: z.string().min(1, "HELIUS_API_KEY is required"),

    // Cloudflare R2
    R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
    R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
    R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
    R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required"),
    R2_SIGNING_SECRET: z.string().min(32, "R2_SIGNING_SECRET must be at least 32 characters"),

    // Auth
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    SIWS_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    // Irys / Arweave
    IRYS_PRIVATE_KEY: z.string().min(1, "IRYS_PRIVATE_KEY is required"),
    IRYS_NETWORK: z.enum(["mainnet", "devnet"]).default("mainnet"),

    // Malware scanning (optional — tracks stay pending_scan without this)
    VIRUSTOTAL_API_KEY: z.string().min(1).optional(),

    // App
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    INGEST_BASE_URL: z.string().url("INGEST_BASE_URL must be a valid URL"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Cron security — Vercel sends this as Bearer token when invoking cron routes
    // Optional so local dev works without it; the route still enforces in production.
    CRON_SECRET: z.string().min(16).optional(),

    // Health check token — external monitoring services pass this as Bearer token
    // Optional so local dev works without it; the /api/health route enforces in production.
    HEALTH_TOKEN: z.string().min(16).optional(),

    // Resend — transactional email (team invites)
    RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
    RESEND_FROM_EMAIL: z.string().email().default("Canopy <no-reply@mail.canopy.build>"),

    // (Stripe removed — billing is on-chain USDC; see the billing block below.)

    // ─── Publisher verification (Phase 1: manual approval over Telegram) ───
    // All optional — the feature degrades gracefully when unset:
    //  - Without the bot vars, no Telegram notification fires (the user can still
    //    reach out via the prefilled t.me link), and approvals go through the
    //    admin-wallet API fallback.
    //  - Without ADMIN_WALLET_HASHES, the admin API is closed (Telegram-only).
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_ADMIN_CHAT_ID: z.string().min(1).optional(), // your numeric Telegram user/chat id
    TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(), // X-Telegram-Bot-Api-Secret-Token
    // Comma-separated SHA-256 wallet hashes allowed to approve via the admin API.
    ADMIN_WALLET_HASHES: z.string().optional(),
    // Founder Telegram username (no @) the request panel deep-links to.
    NEXT_PUBLIC_FOUNDER_TELEGRAM: z.string().default("ImmaDotDev"),

    // ─── On-chain USDC billing (pay-to-extend) ───
    // All optional — billing is simply disabled (no upgrade UI, no crashes) when
    // the merchant wallet is unset/invalid. SOLANA_RPC_URL above is reused for
    // verification. USDC_MINT defaults to mainnet USDC.
    CANOPY_MERCHANT_WALLET: z.string().optional(), // base58 pubkey that receives USDC
    USDC_MINT: z.string().default("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    SOLANA_CLUSTER: z.enum(["mainnet-beta", "devnet"]).default("mainnet-beta"),

    // ─── Herald — privacy-preserving developer notifications ───
    // Optional. When set, Canopy can notify a developer by WALLET address (e.g.
    // build scan complete); Herald resolves the wallet to the dev's own
    // encrypted contact and delivers it — Canopy stores no email/PII. Use a
    // hrld_test_... key for sandbox, hrld_live_... for production.
    HERALD_API_KEY: z.string().min(1).optional(),
    HERALD_BASE_URL: z.string().url().default("https://api.useherald.xyz"),
});

/**
 * Client-side environment variables (safe to expose).
 */
const clientEnvSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

function validateEnv() {
    const parsed = serverEnvSchema.safeParse(process.env);

    if (!parsed.success) {
        const errors = parsed.error.flatten().fieldErrors;
        const messages = Object.entries(errors)
            .map(([field, msgs]) => `  ${field}: ${msgs?.join(", ") ?? "invalid"}`)
            .join("\n");

        throw new Error(
            `\n[canopy] Invalid environment variables:\n${messages}\n\nCheck .env.example for required variables.\n`,
        );
    }

    return parsed.data;
}

// Validate once at module import time — fails fast at startup
export const env = validateEnv();

// Separate export for client-safe vars (subset)
export const clientEnv = clientEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'],
});
