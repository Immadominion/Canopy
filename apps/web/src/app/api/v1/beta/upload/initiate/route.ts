import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { presignApkUpload } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_APK_BYTES = 200 * 1024 * 1024; // 200 MB hard cap

const bodySchema = z.object({
    appId: z.string().uuid(),
    size: z.coerce.number().int().positive().max(MAX_APK_BYTES),
});

/**
 * POST /api/v1/beta/upload/initiate
 *
 * Step 1 of the upload flow. Returns a presigned URL so the browser can PUT the
 * APK straight to R2 — bypassing the serverless function's ~4.5MB request-body
 * limit. Step 2 (the browser uploads to that URL) and step 3 (POST
 * /api/v1/beta/upload to validate + create the track) follow.
 *
 * Body: { appId, size }
 * Returns: { uploadUrl, uploadKey }
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

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();
    const { data: app } = await admin
        .from("apps")
        .select("id, publisher_id")
        .eq("id", parsed.data.appId)
        .maybeSingle();
    if (!app || app.publisher_id !== publisher.id) {
        // Don't reveal whether the app exists — 404 either way (Invariant 5).
        return apiError("NOT_FOUND", "App not found", 404);
    }

    // Publisher-scoped staging key. The finalize route verifies this exact prefix,
    // so a publisher can only ever finalize an object they themselves uploaded.
    const uploadKey = `staging/${publisher.id}/${crypto.randomUUID()}.apk`;
    const uploadUrl = await presignApkUpload(uploadKey);

    return NextResponse.json({ uploadUrl, uploadKey });
}
