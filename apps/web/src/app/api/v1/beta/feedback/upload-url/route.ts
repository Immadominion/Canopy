import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { getSessionWallet } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { presignApkUpload } from "@/lib/r2/client";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({ trackId: z.string().uuid() });

/**
 * POST /api/v1/beta/feedback/upload-url
 *
 * Body: { trackId }. Returns a presigned R2 PUT URL the tester app uploads a
 * feedback screenshot to directly (no body-size limit, no CORS for native).
 * The key is scoped to feedback/{trackId}/ so the submit route can verify it.
 *
 * Auth: SIWS session (Bearer for mobile). Caller must be on the allowlist.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const session = await getSessionWallet();
    if (!session) return apiError("UNAUTHENTICATED", "Sign in with Solana to continue", 401);

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }
    if (!isValidUuid(parsed.data.trackId)) return notFound();

    // Bound screenshot-URL minting per wallet (best-effort anti-abuse).
    const rl = rateLimit(`feedback-url:${session.walletHash}`, 20, 60_000);
    if (!rl.allowed) {
        return apiError("RATE_LIMITED", "Too many requests", 429);
    }

    const admin = createSupabaseAdminClient();
    const { data: tester } = await admin
        .from("beta_testers")
        .select("id")
        .eq("track_id", parsed.data.trackId)
        .eq("wallet_hash", session.walletHash)
        .maybeSingle();
    if (!tester) return notFound();

    const uploadKey = `feedback/${parsed.data.trackId}/${randomUUID()}.jpg`;
    const url = await presignApkUpload(uploadKey);

    return NextResponse.json({ uploadKey, url });
}
