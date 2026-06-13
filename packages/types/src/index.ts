export type { Database } from "./database.types";
export type {
    BetaTrackStatus,
    Publisher,
    PublisherVerificationStatus,
    AccessRequest,
    App,
    BetaTrack,
    BetaTester,
    InstallEvent,
    ApiKey,
    SiwsNonce,
    AnalyticsEvent,
    CrashReport,
    Json,
    RemoteConfig,
    RemoteConfigCondition,
    RemoteConfigConditionType,
    RemoteConfigHistory,
    FunnelDefinition,
    FunnelStep,
    WebhookEndpoint,
    WebhookDelivery,
    WebhookDeliveryStatus,
    ExperimentStatus,
    Experiment,
    ExperimentVariant,
    ExperimentAssignment,
    CohortCondition,
    CohortConditionType,
    CohortCriteria,
    CohortDefinition,
    SkrBalanceTier,
    ApiKeyScope,
    OrgMemberRole,
    OrgActivityLog,
    OrgActivityEntityType,
    StripeSubscriptionStatus,
} from "./database.types";

// API response shapes shared between web and potential future clients
export interface ApiError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
    error: ApiError;
}

export interface PaginatedResponse<T> {
    data: T[];
    cursor: string | null;
    hasMore: boolean;
}

// ---------------------------------------------------------------------------
// SDK types — used by @canopy/react-native and the ingest service
// ---------------------------------------------------------------------------

/** Wallet context captured at the time of a crash or event. */
export interface WalletContext {
    /** SHA-256 hash of the connected wallet address (never plaintext). */
    walletHash: string;
    isSeeker: boolean;
    hasGenesisToken: boolean;
    /** SOL balance tier (bucketed): "none" | "low" | "mid" | "high" */
    skrBalanceTier: "none" | "low" | "mid" | "high" | null;
}

/** A single analytics event as queued on the device. */
export interface CanopyEvent {
    /** Client-generated UUIDv4 for idempotency / deduplication. */
    id: string;
    name: string;
    /** SHA-256 hash of the wallet address. */
    walletHash: string;
    sessionId: string | null;
    properties: Record<string, unknown> | null;
    sdkVersion: string;
    appVersion: string | null;
    /** "android" | "ios" */
    platform: string;
    isSeeker: boolean | null;
    hasGenesisToken: boolean | null;
    skrBalanceTier: "none" | "low" | "mid" | "high" | null;
    /** ISO-8601 timestamp (milliseconds). */
    timestamp: string;
}

/** The request body sent to POST /v1/events. */
export interface FlushPayload {
    apiKey: string;
    appId: string;
    events: CanopyEvent[];
}

/** The crash report body sent to POST /v1/crashes. */
export interface CrashPayload {
    apiKey: string;
    appId: string;
    fingerprint: string;
    errorMessage: string;
    stackTrace: string;
    walletHash: string | null;
    appVersion: string | null;
    sdkVersion: string;
    deviceModel: string | null;
    androidVersion: string | null;
    /** Last N event names before the crash (no PII). */
    lastEvents: string[] | null;
    walletContext: WalletContext | null;
}

/** Configuration passed to <CanopyProvider>. */
export interface CanopyConfig {
    apiKey: string;
    appId: string;
    /** Semantic version of the host app (e.g. "1.0.3"). */
    appVersion?: string;
    /** Base URL of the ingest service. Defaults to production. */
    ingestUrl?: string;
    /** Max events before an automatic flush. Default: 50. */
    flushThreshold?: number;
    /** Flush interval in milliseconds. Default: 30_000 (30 s). */
    flushInterval?: number;
    /** Enable verbose SDK logging in development. Default: false. */
    debug?: boolean;
}
