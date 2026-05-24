import { NextResponse } from "next/server";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { randomBytes } from "crypto";

import type { ApiKeyScope } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";
import { PLAN_LIMITS } from "@/lib/billing/enforce";

const SALT_ROUNDS = 10;
const KEY_PREFIX_HEADER = "cnp_live_";

const ALL_SCOPES: ApiKeyScope[] = [
    "beta:read",
    "beta:write",
    "analytics:read",
    "events:write",
    "crashes:write",
    "releases:write",
];

const createKeySchema = z.object({
    name: z.string().trim().min(1).max(80),
    scopes: z
        .array(z.enum(["beta:read", "beta:write", "analytics:read", "events:write", "crashes:write", "releases:write"]))
        .min(1)
        .default(ALL_SCOPES),
});

/**
 * GET /api/v1/org/api-keys
 *
 * Returns all non-revoked API keys for the publisher's organisation.
 * The key_hash is never returned — only prefix, name, scopes, and timestamps.
 */
export async function GET(): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const admin = createSupabaseAdminClient();

    const { data: org, error: orgError } = await admin
        .from("organizations")
        .select("id, plan")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (orgError) {
        console.error("[api-keys] GET org error", orgError);
        return apiError("DATABASE_ERROR", "Failed to fetch organisation", 500);
    }
    if (!org) {
        return apiError("ORG_NOT_FOUND", "No organisation found for this publisher", 404);
    }

    const { data: keys, error: keysError } = await admin
        .from("api_keys")
        .select("id, key_prefix, name, scopes, last_used_at, created_at")
        .eq("org_id", org.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });

    if (keysError) {
        console.error("[api-keys] GET keys error", keysError);
        return apiError("DATABASE_ERROR", "Failed to fetch API keys", 500);
    }

    const plan = (org.plan as "free" | "pro" | "enterprise") ?? "free";
    const limits = PLAN_LIMITS[plan];

    return NextResponse.json({
        keys: keys ?? [],
        plan,
        limit: limits.maxApiKeys === -1 ? null : limits.maxApiKeys,
    });
}

/**
 * POST /api/v1/org/api-keys
 *
 * Creates a new API key for the publisher's organisation.
 *
 * Returns the plaintext key exactly once — it is never stored.
 * The caller must display it immediately and cannot retrieve it again.
 *
 * Enforces per-plan API key cap.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = createKeySchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, parsed.error.flatten());
    }

    const { name, scopes } = parsed.data;
    const admin = createSupabaseAdminClient();

    // Resolve org + plan
    const { data: org, error: orgError } = await admin
        .from("organizations")
        .select("id, plan")
        .eq("owner_id", auth.publisher.id)
        .maybeSingle();

    if (orgError) {
        console.error("[api-keys] POST org error", orgError);
        return apiError("DATABASE_ERROR", "Failed to fetch organisation", 500);
    }
    if (!org) {
        return apiError("ORG_NOT_FOUND", "No organisation found for this publisher", 404);
    }

    const plan = (org.plan as "free" | "pro" | "enterprise") ?? "free";
    const limits = PLAN_LIMITS[plan];

    // Count active keys for this org
    const { count, error: countError } = await admin
        .from("api_keys")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id)
        .is("revoked_at", null);

    if (countError) {
        console.error("[api-keys] POST count error", countError);
        return apiError("DATABASE_ERROR", "Failed to count API keys", 500);
    }

    const activeCount = count ?? 0;
    const maxKeys = limits.maxApiKeys;

    if (maxKeys !== -1 && activeCount >= maxKeys) {
        return apiError(
            "API_KEY_LIMIT_REACHED",
            `Your ${plan} plan allows a maximum of ${maxKeys.toString()} API keys. Upgrade to create more.`,
            409,
            { current: activeCount, limit: maxKeys, plan },
        );
    }

    // Generate key: cnp_live_{48 hex chars}
    const rawSuffix = randomBytes(24).toString("hex"); // 48 hex chars
    const plaintext = `${KEY_PREFIX_HEADER}${rawSuffix}`;
    // Store only the first 16 chars as the display prefix (safe to show)
    const keyPrefix = plaintext.slice(0, 16);
    // Hash with bcryptjs — never store the plaintext
    const keyHash = await bcryptjs.hash(plaintext, SALT_ROUNDS);

    // Resolve the actor's org_member row for the activity log
    const { data: actorMember } = await admin
        .from("org_members")
        .select("id")
        .eq("org_id", org.id)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    const { data: newKey, error: insertError } = await admin
        .from("api_keys")
        .insert({
            publisher_id: auth.publisher.id,
            org_id: org.id,
            key_prefix: keyPrefix,
            key_hash: keyHash,
            name,
            scopes,
        })
        .select("id, key_prefix, name, scopes, created_at")
        .single();

    if (insertError ?? !newKey) {
        console.error("[api-keys] POST insert error", insertError);
        return apiError("DATABASE_ERROR", "Failed to create API key", 500);
    }

    logActivity({
        orgId: org.id,
        actorId: actorMember?.id ?? null,
        action: "API_KEY_CREATED",
        entityType: "api_key",
        entityId: newKey.id,
        metadata: { name, scope_count: scopes.length },
    });

    // Return plaintext ONCE — after this call, it is unrecoverable
    return NextResponse.json(
        {
            key: {
                id: newKey.id,
                key_prefix: newKey.key_prefix,
                name: newKey.name,
                scopes: newKey.scopes,
                created_at: newKey.created_at,
            },
            // plaintext is returned only in this response — display immediately
            plaintext_key: plaintext,
        },
        { status: 201 },
    );
}
