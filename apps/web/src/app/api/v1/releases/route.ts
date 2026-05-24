import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const log = logger.child({ route: "releases" });

export const runtime = "nodejs";

const createReleaseSchema = z.object({
    appId: z.string().uuid(),
    versionName: z.string().min(1).max(64),
    versionCode: z.coerce.number().int().positive(),
    betaTrackId: z.string().uuid().optional(),
    releaseNotes: z.string().max(2000).optional(),
    apkSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/, "Must be a 64-character lowercase hex SHA-256")
        .optional(),
    checkResults: z
        .object({
            passed: z.boolean(),
            checks: z.array(
                z.object({
                    name: z.string(),
                    passed: z.boolean(),
                    detail: z.string(),
                }),
            ),
        })
        .optional(),
});

/**
 * GET /api/v1/releases?appId={uuid}&cursor={uuid}&limit={n}
 *
 * Returns the release history for an app, newest first.
 */
export async function GET(request: Request): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") {
        return apiError("UNAUTHENTICATED", "Sign in with Solana to continue", 401);
    }
    if (auth.status === "not_publisher") {
        return apiError("NOT_A_PUBLISHER", "Wallet has no publisher record", 403);
    }
    if (auth.status === "kyc_required") {
        return apiError(
            "KYC_REQUIRED",
            "Complete KYC/KYB verification on the dApp Store Publisher Portal first",
            403,
        );
    }

    const { publisher } = auth;
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("appId");
    const cursor = searchParams.get("cursor");
    const limitStr = searchParams.get("limit") ?? "20";

    if (!appId) {
        return apiError("MISSING_PARAM", "Query parameter 'appId' is required", 400);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(appId)) {
        return apiError("INVALID_PARAM", "'appId' must be a valid UUID", 400);
    }

    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 50);

    const admin = createSupabaseAdminClient();

    // Verify app belongs to this publisher.
    const { data: app } = await admin
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!app) {
        return apiError("NOT_FOUND", "App not found", 404);
    }

    let query = admin
        .from("releases")
        .select(
            "id, version_name, version_code, status, release_notes, apk_sha256, check_results, dapp_store_submission_id, submitted_at, published_at, created_at, beta_track_id",
        )
        .eq("app_id", appId)
        .eq("publisher_id", publisher.id)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

    if (cursor) {
        // Fetch releases created before the cursor record.
        const { data: cursorRow } = await admin
            .from("releases")
            .select("created_at")
            .eq("id", cursor)
            .eq("publisher_id", publisher.id)
            .maybeSingle();

        if (cursorRow) {
            query = query.lt("created_at", cursorRow.created_at);
        }
    }

    const { data: releases, error } = await query;

    if (error) {
        log.error({ error, appId }, "Failed to fetch releases");
        return apiError("INTERNAL_ERROR", "Failed to fetch releases", 500);
    }

    const items = releases ?? [];
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return NextResponse.json({ data: page, nextCursor, hasMore });
}

/**
 * POST /api/v1/releases
 *
 * JSON body:
 *   - appId           (uuid, required)
 *   - versionName     (string, required)
 *   - versionCode     (positive int, required)
 *   - betaTrackId     (uuid, optional — links to the tested beta track)
 *   - releaseNotes    (string ≤ 2000, optional)
 *   - apkSha256       (64-char hex, optional)
 *   - checkResults    (JSONB, optional — from `canopy check`)
 *
 * Enforces:
 *   - Invariant 1: publisher must be KYC-verified
 *   - Unique version_code per app
 */
export async function POST(request: Request): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") {
        return apiError("UNAUTHENTICATED", "Sign in with Solana to continue", 401);
    }
    if (auth.status === "not_publisher") {
        return apiError("NOT_A_PUBLISHER", "Wallet has no publisher record", 403);
    }
    if (auth.status === "kyc_required") {
        return apiError(
            "KYC_REQUIRED",
            "Complete KYC/KYB verification on the dApp Store Publisher Portal first",
            403,
        );
    }

    const { publisher } = auth;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_BODY", "Expected JSON body", 400);
    }

    const parsed = createReleaseSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const { appId, versionName, versionCode, betaTrackId, releaseNotes, apkSha256, checkResults } =
        parsed.data;

    const admin = createSupabaseAdminClient();

    // Verify app belongs to this publisher.
    const { data: app } = await admin
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!app) {
        return apiError("NOT_FOUND", "App not found or does not belong to this publisher", 404);
    }

    // Verify betaTrackId belongs to this app if provided.
    if (betaTrackId) {
        const { data: track } = await admin
            .from("beta_tracks")
            .select("id, status")
            .eq("id", betaTrackId)
            .eq("app_id", appId)
            .maybeSingle();

        if (!track) {
            return apiError(
                "BETA_TRACK_NOT_FOUND",
                "Beta track not found or does not belong to this app",
                404,
            );
        }
    }

    // Determine initial status based on whether check results are present.
    type ReleaseStatus = "draft" | "check_pending" | "check_passed" | "check_failed" | "submitted" | "in_review" | "published" | "rejected";
    let initialStatus: ReleaseStatus;
    if (checkResults !== undefined) {
        initialStatus = checkResults.passed ? "check_passed" : "check_failed";
    } else {
        initialStatus = "draft";
    }

    const releaseId = crypto.randomUUID();

    const { data: release, error: insertError } = await admin
        .from("releases")
        .insert({
            id: releaseId,
            app_id: appId,
            publisher_id: publisher.id,
            beta_track_id: betaTrackId ?? null,
            version_name: versionName,
            version_code: versionCode,
            release_notes: releaseNotes ?? null,
            apk_sha256: apkSha256 ?? null,
            status: initialStatus,
            check_results: checkResults ?? null,
        })
        .select(
            "id, version_name, version_code, status, release_notes, apk_sha256, check_results, created_at",
        )
        .single();

    if (insertError) {
        if (insertError.code === "23505") {
            return apiError(
                "DUPLICATE_VERSION_CODE",
                `A release with version code ${String(versionCode)} already exists for this app`,
                409,
            );
        }
        log.error({ error: insertError, appId, versionCode }, "Failed to create release");
        return apiError("INTERNAL_ERROR", "Failed to create release", 500);
    }

    log.info(
        { releaseId, appId, publisherId: publisher.id, versionCode },
        "Release record created",
    );

    return NextResponse.json({ data: release }, { status: 201 });
}
