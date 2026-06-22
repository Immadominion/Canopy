/**
 * Canopy Database TypeScript types.
 *
 * This file mirrors the Supabase PostgreSQL schema defined in supabase/migrations/.
 * After running migrations, regenerate with:
 *   pnpm supabase gen types typescript --local > packages/types/src/database.types.ts
 *
 * IMPORTANT: wallet addresses are never stored in analytics/tester tables.
 * Only `wallet_hash` (SHA-256 of the address) is stored.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
    public: {
        Tables: {
            publishers: {
                Row: {
                    id: string; // uuid
                    wallet_address: string; // stored only in publishers (needed for on-chain verification)
                    wallet_hash: string; // SHA-256 of wallet_address
                    kyc_verified: boolean;
                    kyc_verified_at: string | null; // timestamptz
                    verification_status: "unverified" | "pending" | "approved" | "rejected" | "banned";
                    plan: "free" | "pro" | "enterprise";
                    display_name: string | null;
                    website_url: string | null;
                    created_at: string; // timestamptz
                    updated_at: string; // timestamptz
                };
                Insert: {
                    id?: string;
                    wallet_address: string;
                    wallet_hash: string;
                    kyc_verified?: boolean;
                    kyc_verified_at?: string | null;
                    verification_status?: "unverified" | "pending" | "approved" | "rejected" | "banned";
                    plan?: "free" | "pro" | "enterprise";
                    display_name?: string | null;
                    website_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    wallet_address?: string;
                    wallet_hash?: string;
                    kyc_verified?: boolean;
                    kyc_verified_at?: string | null;
                    verification_status?: "unverified" | "pending" | "approved" | "rejected" | "banned";
                    plan?: "free" | "pro" | "enterprise";
                    display_name?: string | null;
                    website_url?: string | null;
                    updated_at?: string;
                };
                Relationships: [];
            };

            access_requests: {
                Row: {
                    id: string; // uuid
                    publisher_id: string; // fk publishers.id
                    wallet_hash: string;
                    display_name: string;
                    project_summary: string;
                    contact_telegram: string | null;
                    code: string; // short human code
                    onchain_app_nft: boolean | null;
                    status: "pending" | "approved" | "rejected";
                    decided_at: string | null;
                    decided_by: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    publisher_id: string;
                    wallet_hash: string;
                    display_name: string;
                    project_summary: string;
                    contact_telegram?: string | null;
                    code: string;
                    onchain_app_nft?: boolean | null;
                    status?: "pending" | "approved" | "rejected";
                    decided_at?: string | null;
                    decided_by?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    status?: "pending" | "approved" | "rejected";
                    decided_at?: string | null;
                    decided_by?: string | null;
                    updated_at?: string;
                };
                Relationships: [];
            };

            billing_payments: {
                Row: {
                    id: string;
                    org_id: string;
                    plan: "pro" | "enterprise";
                    interval: "monthly" | "annual";
                    amount_base_units: number;
                    tx_signature: string;
                    payer_wallet: string | null;
                    period_start: string;
                    period_end: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    org_id: string;
                    plan: "pro" | "enterprise";
                    interval: "monthly" | "annual";
                    amount_base_units: number;
                    tx_signature: string;
                    payer_wallet?: string | null;
                    period_start?: string;
                    period_end: string;
                    created_at?: string;
                };
                Update: {
                    period_end?: string;
                };
                Relationships: [];
            };

            apps: {
                Row: {
                    id: string; // uuid
                    publisher_id: string; // fk publishers.id
                    name: string;
                    package_name: string; // e.g. com.example.myapp
                    description: string | null;
                    dapp_store_app_id: string | null;
                    org_id: string | null; // fk organizations.id — nullable until org is created
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    publisher_id: string;
                    name: string;
                    package_name: string;
                    description?: string | null;
                    dapp_store_app_id?: string | null;
                    org_id?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    publisher_id?: string;
                    name?: string;
                    package_name?: string;
                    description?: string | null;
                    dapp_store_app_id?: string | null;
                    org_id?: string | null;
                    updated_at?: string;
                };
                Relationships: [];
            };

            beta_tracks: {
                Row: {
                    id: string; // uuid — never expose sequential IDs
                    app_id: string; // fk apps.id
                    publisher_id: string; // fk publishers.id
                    version_name: string;
                    version_code: number;
                    r2_key: string; // internal R2 object key — never expose to client
                    apk_sha256: string; // SHA-256 hash of the APK
                    apk_size_bytes: number;
                    tester_cap: number; // max 200 — CHECK constraint enforced at DB level
                    tester_count: number; // current tester count
                    status:
                    | "pending_scan"
                    | "scan_in_progress"
                    | "scan_passed"
                    | "scan_failed"
                    | "active"
                    | "expired"
                    | "revoked";
                    seeker_only: boolean; // if true, testers must hold a Seeker Genesis Token
                    release_notes: string | null;
                    arweave_tx_id: string | null; // set async when Arweave confirms
                    apk_deleted_at: string | null; // set when the APK is deleted from R2
                    expires_at: string; // timestamptz — NEVER nullable, max 30 days from created_at
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    app_id: string;
                    publisher_id: string;
                    version_name: string;
                    version_code: number;
                    r2_key: string;
                    apk_sha256: string;
                    apk_size_bytes: number;
                    tester_cap?: number;
                    tester_count?: number;
                    status?: BetaTrackStatus;
                    seeker_only?: boolean;
                    release_notes?: string | null;
                    expires_at: string; // required — must be set at creation
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    status?: BetaTrackStatus;
                    seeker_only?: boolean;
                    release_notes?: string | null;
                    arweave_tx_id?: string | null;
                    apk_deleted_at?: string | null;
                    tester_count?: number;
                    // Admin-only (founder console /extend). The DB CHECK
                    // (expires_at <= created_at + 30 days) is the hard backstop;
                    // app code clamps to the same cap before writing.
                    expires_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };

            beta_testers: {
                Row: {
                    id: string; // uuid
                    track_id: string; // fk beta_tracks.id
                    wallet_hash: string; // SHA-256 of tester wallet — never plaintext
                    added_by_publisher_id: string; // fk publishers.id
                    arweave_tx_id: string | null; // set async when Arweave confirms
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    track_id: string;
                    wallet_hash: string;
                    added_by_publisher_id: string;
                    arweave_tx_id?: string | null;
                    created_at?: string;
                };
                Update: {
                    arweave_tx_id?: string | null;
                };
                Relationships: [];
            };

            install_events: {
                Row: {
                    id: string; // uuid
                    track_id: string; // fk beta_tracks.id
                    wallet_hash: string;
                    action: "url_generated" | "download_started" | "install_confirmed";
                    arweave_tx_id: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    track_id: string;
                    wallet_hash: string;
                    action: "url_generated" | "download_started" | "install_confirmed";
                    arweave_tx_id?: string | null;
                    created_at?: string;
                };
                Update: {
                    arweave_tx_id?: string | null;
                };
                Relationships: [];
            };

            api_keys: {
                Row: {
                    id: string; // uuid
                    publisher_id: string; // fk publishers.id
                    org_id: string | null; // fk organizations.id — set for org-scoped keys
                    app_id: string | null; // null = wildcard scope across all apps
                    key_prefix: string; // first 12 chars of key (for display/lookup)
                    key_hash: string; // bcryptjs hash — plaintext never stored
                    name: string; // human label
                    scopes: ApiKeyScope[]; // permissions this key grants
                    last_used_at: string | null;
                    revoked_at: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    publisher_id: string;
                    org_id?: string | null;
                    app_id?: string | null;
                    key_prefix: string;
                    key_hash: string;
                    name: string;
                    scopes?: ApiKeyScope[];
                    last_used_at?: string | null;
                    revoked_at?: string | null;
                    created_at?: string;
                };
                Update: {
                    name?: string;
                    org_id?: string | null;
                    scopes?: ApiKeyScope[];
                    last_used_at?: string | null;
                    revoked_at?: string | null;
                };
                Relationships: [];
            };

            org_activity_log: {
                Row: {
                    id: string; // uuid
                    org_id: string; // fk organizations.id
                    actor_id: string | null; // fk org_members.id — null = system
                    action: string; // SCREAMING_SNAKE_CASE verb, e.g. API_KEY_CREATED
                    entity_type: OrgActivityEntityType;
                    entity_id: string | null; // uuid of the affected entity
                    metadata: Record<string, unknown> | null; // non-sensitive extra context
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    org_id: string;
                    actor_id?: string | null;
                    action: string;
                    entity_type: OrgActivityEntityType;
                    entity_id?: string | null;
                    metadata?: Record<string, unknown> | null;
                    created_at?: string;
                };
                Update: Record<string, never>; // activity log is append-only
                Relationships: [];
            };

            siws_nonces: {
                Row: {
                    id: string; // uuid
                    nonce: string; // 64 hex chars
                    used: boolean;
                    expires_at: string; // timestamptz — 5 minute TTL
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    nonce: string;
                    used?: boolean;
                    expires_at: string;
                    created_at?: string;
                };
                Update: {
                    used?: boolean;
                };
                Relationships: [];
            };

            analytics_events: {
                // TimescaleDB hypertable — ALWAYS include time range in queries
                Row: {
                    id: string; // uuid
                    app_id: string; // fk apps.id
                    name: string;
                    wallet_hash: string;
                    session_id: string | null;
                    properties: Json | null;
                    sdk_version: string | null;
                    app_version: string | null;
                    platform: string | null;
                    is_seeker: boolean | null;
                    has_genesis_token: boolean | null;
                    skr_balance_tier: "none" | "low" | "medium" | "high" | null;
                    timestamp: string; // timestamptz — partition key
                };
                Insert: {
                    id?: string;
                    app_id: string;
                    name: string;
                    wallet_hash: string;
                    session_id?: string | null;
                    properties?: Json | null;
                    sdk_version?: string | null;
                    app_version?: string | null;
                    platform?: string | null;
                    is_seeker?: boolean | null;
                    has_genesis_token?: boolean | null;
                    skr_balance_tier?: "none" | "low" | "medium" | "high" | null;
                    timestamp: string;
                };
                Update: never; // analytics events are immutable
                Relationships: [];
            };

            crash_reports: {
                Row: {
                    id: string; // uuid
                    app_id: string; // fk apps.id
                    fingerprint: string; // deduplication key
                    error_message: string;
                    stack_trace: string;
                    wallet_hash: string | null;
                    app_version: string | null;
                    sdk_version: string | null;
                    device_model: string | null;
                    android_version: string | null;
                    occurrence_count: number;
                    first_seen_at: string; // timestamptz
                    last_seen_at: string; // timestamptz
                    resolved_at: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    app_id: string;
                    fingerprint: string;
                    error_message: string;
                    stack_trace: string;
                    wallet_hash?: string | null;
                    app_version?: string | null;
                    sdk_version?: string | null;
                    device_model?: string | null;
                    android_version?: string | null;
                    occurrence_count?: number;
                    first_seen_at?: string;
                    last_seen_at?: string;
                    resolved_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    occurrence_count?: number;
                    last_seen_at?: string;
                    resolved_at?: string | null;
                    updated_at?: string;
                };
                Relationships: [];
            };
            organizations: {
                Row: {
                    id: string; // uuid
                    name: string;
                    owner_id: string; // fk publishers.id
                    plan: "free" | "pro" | "enterprise";
                    stripe_customer_id: string | null;
                    stripe_subscription_id: string | null;
                    stripe_price_id: string | null;
                    subscription_status: StripeSubscriptionStatus | null;
                    current_period_end: string | null; // timestamptz
                    cancel_at_period_end: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    owner_id: string;
                    plan?: "free" | "pro" | "enterprise";
                    stripe_customer_id?: string | null;
                    stripe_subscription_id?: string | null;
                    stripe_price_id?: string | null;
                    subscription_status?: StripeSubscriptionStatus | null;
                    current_period_end?: string | null;
                    cancel_at_period_end?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    name?: string;
                    plan?: "free" | "pro" | "enterprise";
                    stripe_customer_id?: string | null;
                    stripe_subscription_id?: string | null;
                    stripe_price_id?: string | null;
                    subscription_status?: StripeSubscriptionStatus | null;
                    current_period_end?: string | null;
                    cancel_at_period_end?: boolean;
                    updated_at?: string;
                };
                Relationships: [];
            };

            usage_snapshots: {
                Row: {
                    id: string; // uuid
                    org_id: string; // fk organizations.id
                    period_start: string; // date
                    period_end: string; // date
                    events_ingested: number;
                    beta_testers_peak: number;
                    crash_reports: number;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    org_id: string;
                    period_start: string;
                    period_end: string;
                    events_ingested?: number;
                    beta_testers_peak?: number;
                    crash_reports?: number;
                    created_at?: string;
                };
                Update: {
                    events_ingested?: number;
                    beta_testers_peak?: number;
                    crash_reports?: number;
                };
                Relationships: [];
            };

            org_members: {
                Row: {
                    id: string; // uuid
                    org_id: string; // fk organizations.id
                    publisher_id: string | null; // null while invite pending
                    role: OrgMemberRole;
                    invited_email: string | null;
                    invited_by: string; // fk publishers.id
                    invited_at: string; // timestamptz
                    joined_at: string | null; // null = invite pending
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    org_id: string;
                    publisher_id?: string | null;
                    role: OrgMemberRole;
                    invited_email?: string | null;
                    invited_by: string;
                    invited_at?: string;
                    joined_at?: string | null;
                    created_at?: string;
                };
                Update: {
                    publisher_id?: string | null;
                    role?: OrgMemberRole;
                    joined_at?: string | null;
                };
                Relationships: [];
            };

            org_invites: {
                Row: {
                    id: string; // uuid
                    org_id: string; // fk organizations.id
                    invited_email: string;
                    invited_wallet_hash: string | null; // SHA-256(wallet) the invite is bound to
                    role: Exclude<OrgMemberRole, "owner">;
                    token: string; // secure random token — never log
                    invited_by: string; // fk publishers.id
                    expires_at: string; // timestamptz
                    accepted_at: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    org_id: string;
                    invited_email: string;
                    invited_wallet_hash?: string | null;
                    role: Exclude<OrgMemberRole, "owner">;
                    token: string;
                    invited_by: string;
                    expires_at?: string;
                    accepted_at?: string | null;
                    created_at?: string;
                };
                Update: {
                    accepted_at?: string | null;
                };
                Relationships: [];
            };

            remote_configs: {
                Row: {
                    id: string; // uuid
                    app_id: string; // fk apps.id
                    key: string; // e.g. "feature_new_swap_ui"
                    description: string | null;
                    base_value: Json; // returned when no condition matches
                    conditions: RemoteConfigCondition[]; // ordered; first match wins
                    enabled: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    app_id: string;
                    key: string;
                    description?: string | null;
                    base_value: Json;
                    conditions?: RemoteConfigCondition[];
                    enabled?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    key?: string;
                    description?: string | null;
                    base_value?: Json;
                    conditions?: RemoteConfigCondition[];
                    enabled?: boolean;
                    updated_at?: string;
                };
                Relationships: [];
            };

            remote_config_history: {
                Row: {
                    id: string; // uuid
                    seq: number; // monotonic identity — order by this for rollback
                    config_id: string; // fk remote_configs.id
                    previous_base_value: Json;
                    previous_conditions: RemoteConfigCondition[];
                    previous_enabled: boolean;
                    changed_by: string | null; // fk publishers.id — null = API key / system
                    change_note: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    config_id: string;
                    previous_base_value: Json;
                    previous_conditions?: RemoteConfigCondition[];
                    previous_enabled: boolean;
                    changed_by?: string | null;
                    change_note?: string | null;
                    created_at?: string;
                };
                Update: Record<string, never>; // history is append-only
                Relationships: [];
            };

            funnel_definitions: {
                Row: {
                    id: string; // uuid
                    app_id: string; // fk apps.id
                    name: string;
                    steps: FunnelStep[]; // ordered array of steps
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    app_id: string;
                    name: string;
                    steps?: FunnelStep[];
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    name?: string;
                    steps?: FunnelStep[];
                    updated_at?: string;
                };
                Relationships: [];
            };

            webhook_endpoints: {
                Row: {
                    id: string; // uuid
                    app_id: string; // fk apps.id
                    url: string; // https:// only
                    signing_secret: string; // never return to client — service_role only
                    events: string[]; // event types to forward; empty = all
                    enabled: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    app_id: string;
                    url: string;
                    signing_secret: string;
                    events?: string[];
                    enabled?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    url?: string;
                    events?: string[];
                    enabled?: boolean;
                    updated_at?: string;
                };
                Relationships: [];
            };

            webhook_deliveries: {
                Row: {
                    id: string; // uuid
                    endpoint_id: string; // fk webhook_endpoints.id
                    event_type: string;
                    payload: Json;
                    status: WebhookDeliveryStatus;
                    attempts: number;
                    next_attempt_at: string; // timestamptz
                    last_http_status: number | null;
                    last_error: string | null;
                    delivered_at: string | null; // timestamptz
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    endpoint_id: string;
                    event_type: string;
                    payload: Json;
                    status?: WebhookDeliveryStatus;
                    attempts?: number;
                    next_attempt_at?: string;
                    last_http_status?: number | null;
                    last_error?: string | null;
                    delivered_at?: string | null;
                    created_at?: string;
                };
                Update: {
                    status?: WebhookDeliveryStatus;
                    attempts?: number;
                    next_attempt_at?: string;
                    last_http_status?: number | null;
                    last_error?: string | null;
                    delivered_at?: string | null;
                };
                Relationships: [];
            };

            releases: {
                Row: {
                    id: string; // uuid
                    app_id: string; // fk apps.id
                    publisher_id: string; // fk publishers.id
                    beta_track_id: string | null; // fk beta_tracks.id
                    version_name: string;
                    version_code: number;
                    apk_sha256: string | null;
                    apk_r2_key: string | null;
                    release_notes: string | null;
                    status:
                    | "draft"
                    | "check_pending"
                    | "check_passed"
                    | "check_failed"
                    | "submitted"
                    | "in_review"
                    | "published"
                    | "rejected";
                    check_results: { passed: boolean; checks: { name: string; passed: boolean; detail: string }[] } | null;
                    dapp_store_submission_id: string | null;
                    rejection_reason: string | null;
                    submitted_at: string | null;
                    published_at: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    app_id: string;
                    publisher_id: string;
                    beta_track_id?: string | null;
                    version_name: string;
                    version_code: number;
                    apk_sha256?: string | null;
                    apk_r2_key?: string | null;
                    release_notes?: string | null;
                    status?:
                    | "draft"
                    | "check_pending"
                    | "check_passed"
                    | "check_failed"
                    | "submitted"
                    | "in_review"
                    | "published"
                    | "rejected";
                    check_results?: { passed: boolean; checks: { name: string; passed: boolean; detail: string }[] } | null;
                    dapp_store_submission_id?: string | null;
                    rejection_reason?: string | null;
                    submitted_at?: string | null;
                    published_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    status?:
                    | "draft"
                    | "check_pending"
                    | "check_passed"
                    | "check_failed"
                    | "submitted"
                    | "in_review"
                    | "published"
                    | "rejected";
                    release_notes?: string | null;
                    check_results?: { passed: boolean; checks: { name: string; passed: boolean; detail: string }[] } | null;
                    dapp_store_submission_id?: string | null;
                    rejection_reason?: string | null;
                    submitted_at?: string | null;
                    published_at?: string | null;
                    updated_at?: string;
                };
                Relationships: [
                    { foreignKeyName: "releases_app_id_fkey"; columns: ["app_id"]; referencedRelation: "apps"; referencedColumns: ["id"] },
                    { foreignKeyName: "releases_publisher_id_fkey"; columns: ["publisher_id"]; referencedRelation: "publishers"; referencedColumns: ["id"] },
                    { foreignKeyName: "releases_beta_track_id_fkey"; columns: ["beta_track_id"]; referencedRelation: "beta_tracks"; referencedColumns: ["id"] },
                ];
            };

            experiments: {
                Row: {
                    id: string; // uuid
                    app_id: string; // fk apps.id
                    name: string;
                    description: string | null;
                    traffic_percentage: number; // 1–100
                    status: "draft" | "active" | "concluded";
                    remote_config_id: string | null; // fk remote_configs.id
                    started_at: string | null;
                    concluded_at: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    app_id: string;
                    name: string;
                    description?: string | null;
                    traffic_percentage?: number;
                    status?: "draft" | "active" | "concluded";
                    remote_config_id?: string | null;
                    started_at?: string | null;
                    concluded_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    name?: string;
                    description?: string | null;
                    traffic_percentage?: number;
                    status?: "draft" | "active" | "concluded";
                    remote_config_id?: string | null;
                    started_at?: string | null;
                    concluded_at?: string | null;
                    updated_at?: string;
                };
                Relationships: [];
            };

            experiment_variants: {
                Row: {
                    id: string; // uuid
                    experiment_id: string; // fk experiments.id
                    name: string;
                    weight: number; // relative weight >= 1
                    config_value: Json | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    experiment_id: string;
                    name: string;
                    weight?: number;
                    config_value?: Json | null;
                    created_at?: string;
                };
                Update: {
                    name?: string;
                    weight?: number;
                    config_value?: Json | null;
                };
                Relationships: [];
            };

            cohort_definitions: {
                Row: {
                    id: string; // uuid
                    publisher_id: string; // fk publishers.id
                    app_id: string | null; // fk apps.id (null = all apps)
                    name: string;
                    description: string | null;
                    criteria: CohortCriteria;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    publisher_id: string;
                    app_id?: string | null;
                    name: string;
                    description?: string | null;
                    criteria?: CohortCriteria;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    name?: string;
                    description?: string | null;
                    app_id?: string | null;
                    criteria?: CohortCriteria;
                    updated_at?: string;
                };
                Relationships: [];
            };
        };

        Views: Record<string, never>;

        Functions: {
            increment_tester_count: {
                Args: { p_track_id: string };
                Returns: { new_count: number; over_cap: boolean }[];
            };
            decrement_tester_count: {
                Args: { p_track_id: string };
                Returns: number;
            };
            get_top_events: {
                Args: { _app_id: string; _since: string; _limit?: number };
                Returns: { event_name: string; event_count: number; pct: number }[];
            };
            get_mwa_funnel: {
                Args: { _app_id: string; _since: string };
                Returns: { step: string; wallet_count: number }[];
            };
            get_skr_tiers: {
                Args: { _app_id: string; _since: string };
                Returns: { tier: string; wallet_count: number }[];
            };
            get_funnel_counts: {
                Args: { _app_id: string; _steps: string[]; _since: string; _until?: string };
                Returns: { step_index: number; event_name: string; wallet_count: number }[];
            };
            get_retention: {
                Args: { _app_id: string; _since: string; _until?: string; _max_days?: number };
                Returns: { day_offset: number; wallet_count: number }[];
            };
            get_event_properties: {
                Args: { _app_id: string; _event_name: string; _since: string; _limit?: number };
                Returns: { property_key: string; sample_values: string[] }[];
            };
            get_nft_cohorts: {
                Args: { _app_id: string; _since: string };
                Returns: { has_genesis_token: boolean; distinct_wallets: number }[];
            };
            delete_app_cascade: {
                Args: { p_app_id: string };
                Returns: { r2_key: string }[];
            };
            get_active_wallet_counts: {
                Args: { _app_id: string; _now?: string };
                Returns: { dau: number; wau: number; mau: number }[];
            };
        };

        Enums: {
            beta_track_status: BetaTrackStatus;
            publisher_plan: "free" | "pro" | "enterprise";
        };
    };
}

export type BetaTrackStatus =
    | "pending_scan"
    | "scan_in_progress"
    | "scan_passed"
    | "scan_failed"
    | "active"
    | "expired"
    | "revoked";

// Convenience row types
export type Publisher = Database["public"]["Tables"]["publishers"]["Row"];
export type PublisherVerificationStatus = Publisher["verification_status"];
export type AccessRequest = Database["public"]["Tables"]["access_requests"]["Row"];
export type App = Database["public"]["Tables"]["apps"]["Row"];
export type BetaTrack = Database["public"]["Tables"]["beta_tracks"]["Row"];
export type BetaTester = Database["public"]["Tables"]["beta_testers"]["Row"];
export type InstallEvent = Database["public"]["Tables"]["install_events"]["Row"];
export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];
export type SiwsNonce = Database["public"]["Tables"]["siws_nonces"]["Row"];
export type AnalyticsEvent = Database["public"]["Tables"]["analytics_events"]["Row"];
export type CrashReport = Database["public"]["Tables"]["crash_reports"]["Row"];
export type Release = Database["public"]["Tables"]["releases"]["Row"];
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type OrgMember = Database["public"]["Tables"]["org_members"]["Row"];
export type OrgInvite = Database["public"]["Tables"]["org_invites"]["Row"];

export type OrgMemberRole = "owner" | "admin" | "developer" | "viewer";

export type StripeSubscriptionStatus =
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete"
    | "incomplete_expired"
    | "paused";

export type UsageSnapshot = Database["public"]["Tables"]["usage_snapshots"]["Row"];
export type OrgActivityLog = Database["public"]["Tables"]["org_activity_log"]["Row"];

/** Valid API key scope strings. */
export type ApiKeyScope =
    | "beta:read"
    | "beta:write"
    | "analytics:read"
    | "events:write"
    | "crashes:write"
    | "releases:write";

/** Entity types that can appear in the activity log. */
export type OrgActivityEntityType =
    | "api_key"
    | "member"
    | "beta_track"
    | "org"
    | "billing"
    | "release"
    | "remote_config"
    | "webhook"
    | "funnel";

// ─── Remote Config ────────────────────────────────────────────────────────────

export type RemoteConfigConditionType =
    | "seeker_only"
    | "app_version"
    | "percentage_rollout"
    | "on_chain_cohort";

export interface RemoteConfigCondition {
    type: RemoteConfigConditionType;
    /** The value to return when this condition matches. */
    override_value: Json;
    /** percentage_rollout: 0–100 */
    percentage?: number;
    /** app_version: comparison operator */
    operator?: "gte" | "lte" | "eq";
    /** app_version: semver string */
    version?: string;
    /** on_chain_cohort: minimum SKR balance tier (1–4) */
    min_skr_tier?: 1 | 2 | 3 | 4;
    /**
     * on_chain_cohort: NFT collection mint address (base58).
     * Evaluated on-device by SDK via Helius DAS API (getAssetsByOwner).
     * Server-side evaluation uses Helius DAS during SIWS install gate checks.
     */
    nft_collection?: string;
    /** on_chain_cohort: reference a saved cohort definition by ID */
    cohort_id?: string;
}

export type RemoteConfig = Database["public"]["Tables"]["remote_configs"]["Row"];
export type RemoteConfigHistory = Database["public"]["Tables"]["remote_config_history"]["Row"];

// ─── Advanced Analytics ───────────────────────────────────────────────────────

export interface FunnelStep {
    event_name: string;
    label: string;
}

export type FunnelDefinition = Database["public"]["Tables"]["funnel_definitions"]["Row"];

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";
export type WebhookEndpoint = Database["public"]["Tables"]["webhook_endpoints"]["Row"];
export type WebhookDelivery = Database["public"]["Tables"]["webhook_deliveries"]["Row"];

// ─── A/B Experiments ─────────────────────────────────────────────────────────

export type ExperimentStatus = "draft" | "active" | "concluded";
export type Experiment = Database["public"]["Tables"]["experiments"]["Row"];
export type ExperimentVariant = Database["public"]["Tables"]["experiment_variants"]["Row"];

/** Resolved assignment returned alongside remote-config values. */
export interface ExperimentAssignment {
    experimentId: string;
    experimentName: string;
    variantId: string;
    variantName: string;
}

// ─── Cohort Builder ──────────────────────────────────────────────────────────

export type CohortConditionType =
    | "seeker_only"
    | "has_genesis_token"
    | "skr_balance_tier"
    | "nft_collection";

export type SkrBalanceTier = "low" | "medium" | "high";

export type CohortCondition =
    | { type: "seeker_only" }
    | { type: "has_genesis_token" }
    | { type: "skr_balance_tier"; min_tier: SkrBalanceTier }
    | { type: "nft_collection"; collection_mint: string; min_count?: number };

export interface CohortCriteria {
    operator: "and" | "or";
    conditions: CohortCondition[];
}

export type CohortDefinition = Database["public"]["Tables"]["cohort_definitions"]["Row"];

