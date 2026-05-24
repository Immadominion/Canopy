import { type NextRequest, NextResponse } from "next/server";

import type { ExperimentAssignment, ExperimentVariant, Json, RemoteConfig, RemoteConfigCondition } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// ─── Condition evaluation ─────────────────────────────────────────────────────

function semverToInt(v: string): number {
    const parts = v.split(".").map((p) => parseInt(p, 10));
    return ((parts[0] ?? 0) * 1_000_000) + ((parts[1] ?? 0) * 1_000) + (parts[2] ?? 0);
}

/**
 * Deterministic 0–99 bucket for a wallet+config pair.
 * Uses FNV-1a 32-bit hash to map the combined string to a bucket.
 */
function rolloutBucket(walletHash: string, configId: string): number {
    const input = `${walletHash}:${configId}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash % 100;
}

interface EvalContext {
    walletHash?: string;
    isSeeker?: boolean;
    appVersion?: string;
    skrBalanceTier?: string;
    /** Collection mint addresses the wallet holds — sent by SDK via Helius DAS. */
    nftCollections?: string[];
}

function evaluateCondition(
    condition: RemoteConfigCondition,
    context: EvalContext,
    configId: string,
): boolean {
    switch (condition.type) {
        case "seeker_only":
            return context.isSeeker === true;

        case "percentage_rollout": {
            const pct = condition.percentage ?? 0;
            if (!context.walletHash) return false;
            return rolloutBucket(context.walletHash, configId) < pct;
        }

        case "app_version": {
            if (!context.appVersion || !condition.version || !condition.operator) return false;
            const current = semverToInt(context.appVersion);
            const target = semverToInt(condition.version);
            if (condition.operator === "gte") return current >= target;
            if (condition.operator === "lte") return current <= target;
            if (condition.operator === "eq") return current === target;
            return false;
        }

        case "on_chain_cohort": {
            // SKR balance tier — evaluated from SDK-reported context
            if (condition.min_skr_tier !== undefined) {
                const tierMap: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
                const currentTier = tierMap[context.skrBalanceTier ?? "none"] ?? 0;
                // min_skr_tier 1=low, 2=medium, 3=high, 4=very high (>= high)
                const requiredTier = condition.min_skr_tier - 1;
                if (currentTier < requiredTier) return false;
            }
            // NFT collection check — SDK sends held collection mints via nftCollections param
            if (condition.nft_collection) {
                const held = context.nftCollections ?? [];
                if (!held.includes(condition.nft_collection)) return false;
            }
            return true;
        }
    }
}

function resolveValue(config: RemoteConfig, context: EvalContext): Json {
    const conditions = (config.conditions ?? []) as RemoteConfigCondition[];
    for (const condition of conditions) {
        if (evaluateCondition(condition, context, config.id)) {
            return condition.override_value as Json;
        }
    }
    return config.base_value;
}

// ─── A/B experiment assignment ────────────────────────────────────────────────

/**
 * Deterministic variant assignment.
 * Uses FNV-1a hash of (walletHash + experimentId) mod totalWeight.
 * Returns the index of the assigned variant.
 */
function assignVariant(
    walletHash: string,
    experimentId: string,
    variants: ExperimentVariant[],
): ExperimentVariant | null {
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight === 0) return null;

    const input = `${walletHash}:${experimentId}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    const bucket = hash % totalWeight;

    let cumulative = 0;
    for (const variant of variants) {
        cumulative += variant.weight;
        if (bucket < cumulative) return variant;
    }
    return variants[variants.length - 1] ?? null;
}

/**
 * Resolve active A/B experiments for the app.
 * Returns:
 *   - Updated config overrides (experiment values win over base config)
 *   - Experiment assignments map (for SDK to tag analytics events)
 */
function resolveExperiments(
    experiments: Array<{
        id: string;
        name: string;
        traffic_percentage: number;
        remote_config_id: string | null;
        experiment_variants: ExperimentVariant[];
    }>,
    configKeyMap: Map<string, { key: string }>,
    walletHash: string,
): {
    overrides: Map<string, Json>;
    assignments: ExperimentAssignment[];
} {
    const overrides = new Map<string, Json>();
    const assignments: ExperimentAssignment[] = [];

    for (const exp of experiments) {
        // Check if wallet is in experiment traffic
        const trafficBucket = rolloutBucket(walletHash, `traffic:${exp.id}`);
        if (trafficBucket >= exp.traffic_percentage) continue;

        const variants = exp.experiment_variants;
        if (variants.length === 0) continue;

        const variant = assignVariant(walletHash, exp.id, variants);
        if (!variant) continue;

        assignments.push({
            experimentId: exp.id,
            experimentName: exp.name,
            variantId: variant.id,
            variantName: variant.name,
        });

        // Apply config override if this experiment is linked to a config key
        if (exp.remote_config_id) {
            const configEntry = configKeyMap.get(exp.remote_config_id);
            if (configEntry && variant.config_value !== null) {
                overrides.set(configEntry.key, variant.config_value);
            }
        }
    }

    return { overrides, assignments };
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/remote-config?appId=...&walletHash=...&appVersion=...
 *
 * SDK-facing endpoint. Requires a valid Bearer API key with analytics:read scope.
 * Returns resolved key/value pairs after evaluating conditions + A/B assignments.
 *
 * Query parameters:
 *   appId          — required
 *   walletHash     — optional; SHA-256 hash of wallet (never plaintext)
 *   appVersion     — optional; semver string for app_version conditions
 *   isSeeker       — optional; "true" if the device holds a Seeker Genesis Token
 *   skrTier        — optional; "none" | "low" | "medium" | "high"
 *   nftCollections — optional; comma-separated NFT collection mint addresses held
 *                    by the wallet (evaluated on-device by the SDK via Helius DAS)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    // Validate API key from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer cnp_live_")) {
        return apiError("UNAUTHENTICATED", "Valid API key required", 401);
    }

    const rawKey = authHeader.slice(7);
    if (rawKey.length < 16) {
        return apiError("UNAUTHENTICATED", "Invalid API key format", 401);
    }

    const keyPrefix = rawKey.slice(0, 16);
    const appId = request.nextUrl.searchParams.get("appId");

    if (!appId) {
        return apiError("MISSING_PARAM", "appId query parameter is required", 400);
    }

    const admin = createSupabaseAdminClient();

    // Look up the key by prefix and verify scope
    const { data: keyRow } = await admin
        .from("api_keys")
        .select("id, key_hash, scopes, revoked_at, app_id")
        .eq("key_prefix", keyPrefix)
        .is("revoked_at", null)
        .maybeSingle();

    if (!keyRow) {
        return apiError("UNAUTHENTICATED", "Invalid or revoked API key", 401);
    }

    // Verify HMAC — import bcryptjs here to avoid module-level instantiation
    const { default: bcryptjs } = await import("bcryptjs");
    const valid = await bcryptjs.compare(rawKey, keyRow.key_hash);
    if (!valid) {
        return apiError("UNAUTHENTICATED", "Invalid API key", 401);
    }

    if (!keyRow.scopes.includes("analytics:read")) {
        return apiError("FORBIDDEN", "API key does not have analytics:read scope", 403);
    }

    // If key is app-scoped, enforce it matches the requested appId
    if (keyRow.app_id && keyRow.app_id !== appId) {
        return apiError("FORBIDDEN", "API key is scoped to a different app", 403);
    }

    // Verify the appId exists
    const { data: app } = await admin.from("apps").select("id").eq("id", appId).maybeSingle();
    if (!app) {
        return apiError("NOT_FOUND", "App not found", 404);
    }

    // Fetch all enabled configs for this app
    const { data: configs, error } = await admin
        .from("remote_configs")
        .select("id, key, base_value, conditions, enabled")
        .eq("app_id", appId)
        .eq("enabled", true);

    if (error) {
        console.error("[remote-config] GET configs error", error);
        return apiError("DATABASE_ERROR", "Failed to fetch remote configs", 500);
    }

    // Parse nftCollections — comma-separated list of collection mint addresses
    const nftCollectionsParam = request.nextUrl.searchParams.get("nftCollections");
    const nftCollections = nftCollectionsParam
        ? nftCollectionsParam.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

    // Build evaluation context from query params
    const walletHashParam = request.nextUrl.searchParams.get("walletHash");
    const appVersionParam = request.nextUrl.searchParams.get("appVersion");
    const skrTierParam = request.nextUrl.searchParams.get("skrTier");
    const ctx: EvalContext = {
        isSeeker: request.nextUrl.searchParams.get("isSeeker") === "true",
        nftCollections,
        ...(walletHashParam !== null ? { walletHash: walletHashParam } : {}),
        ...(appVersionParam !== null ? { appVersion: appVersionParam } : {}),
        ...(skrTierParam !== null ? { skrBalanceTier: skrTierParam } : {}),
    };

    // Resolve each config value
    const resolved: Record<string, Json> = {};
    const configKeyMap = new Map<string, { key: string }>();

    for (const config of configs ?? []) {
        resolved[config.key] = resolveValue(config as RemoteConfig, ctx);
        configKeyMap.set(config.id, { key: config.key });
    }

    // Resolve active A/B experiments (only when walletHash is available)
    let experiments: ExperimentAssignment[] = [];
    if (ctx.walletHash) {
        const { data: activeExps } = await admin
            .from("experiments")
            .select("id, name, traffic_percentage, remote_config_id")
            .eq("app_id", appId)
            .eq("status", "active");

        if (activeExps && activeExps.length > 0) {
            const expIds = activeExps.map((e) => e.id);
            const { data: allVariants } = await admin
                .from("experiment_variants")
                .select("id, experiment_id, name, weight, config_value, created_at")
                .in("experiment_id", expIds);

            const variantsByExp = new Map<string, ExperimentVariant[]>();
            for (const v of allVariants ?? []) {
                const arr = variantsByExp.get(v.experiment_id) ?? [];
                arr.push(v as ExperimentVariant);
                variantsByExp.set(v.experiment_id, arr);
            }

            const expsWithVariants = activeExps.map((e) => ({
                ...e,
                experiment_variants: variantsByExp.get(e.id) ?? [],
            }));

            const { overrides, assignments } = resolveExperiments(
                expsWithVariants,
                configKeyMap,
                ctx.walletHash,
            );

            // Experiment values override condition-resolved values
            for (const [key, value] of overrides) {
                resolved[key] = value;
            }

            experiments = assignments;
        }
    }

    // Update last_used_at asynchronously (fire and forget)
    void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

    return NextResponse.json({
        config: resolved,
        // _experiments is used by the SDK to tag analytics events with variant info.
        // Structure: [{ experimentId, experimentName, variantId, variantName }]
        _experiments: experiments,
    });
}
