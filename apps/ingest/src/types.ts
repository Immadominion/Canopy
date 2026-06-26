/**
 * Cloudflare Workers environment bindings.
 * Must match wrangler.toml exactly.
 */
export interface Env {
    // KV namespaces
    API_KEYS_KV: KVNamespace;
    EVENT_DEDUP_KV: KVNamespace;

    // Durable Objects
    RATE_LIMITER: DurableObjectNamespace;
    MONTHLY_QUOTA: DurableObjectNamespace;

    // Hyperdrive (Supabase connection pool)
    HYPERDRIVE: Hyperdrive;

    // Secrets (set via `wrangler secret put`)
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;

    // Vars
    ENVIRONMENT: "local" | "production";
}

/**
 * Inbound event from SDK batch payload.
 */
export interface IngestEvent {
    id: string; // Client-generated UUID (for deduplication)
    name: string;
    walletHash: string; // SHA-256 hashed — never plaintext
    sessionId?: string | undefined;
    properties?: Record<string, unknown> | undefined;
    sdkVersion?: string | undefined;
    appVersion?: string | undefined;
    platform?: string | undefined;
    isSeeker?: boolean | undefined;
    hasGenesisToken?: boolean | undefined;
    skrBalanceTier?: "none" | "low" | "medium" | "high" | undefined;
    timestamp: number; // Unix ms
}

/**
 * Batch request body from SDK.
 */
export interface EventsBatchRequest {
    apiKey: string;
    appId: string;
    events: IngestEvent[];
}

/**
 * Crash report from SDK.
 */
export interface CrashReportRequest {
    apiKey: string;
    appId: string;
    fingerprint: string;
    errorMessage: string;
    stackTrace: string;
    walletHash?: string;
    appVersion?: string;
    sdkVersion?: string;
    deviceModel?: string;
    androidVersion?: string;
    lastEvents?: IngestEvent[];
    walletContext?: Record<string, unknown>;
    timestamp: number;
}
