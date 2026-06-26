import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { getSessionWallet } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { statApkInR2 } from "@/lib/r2/client";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10MB

const bodySchema = z.object({
    trackId: z.string().uuid(),
    message: z.string().trim().min(1).max(2000),
    screenshotKey: z.string().max(256).optional(),
    appVersionCode: z.number().int().nonnegative().optional(),
});

/**
 * POST /api/v1/beta/feedback
 *
 * Body: { trackId, message, screenshotKey?, appVersionCode? }. A tester sends
 * written feedback (optionally with a screenshot already uploaded via the
 * upload-url flow) on a build they're allowlisted for.
 *
 * Auth: SIWS session (Bearer for mobile). Caller must be on the allowlist. The
 * screenshotKey, if present, must live under feedback/{trackId}/ and exist in R2.
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

    // Bound feedback volume per wallet (best-effort anti-spam).
    const rl = rateLimit(`feedback:${session.walletHash}`, 10, 60_000);
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

    // Validate the screenshot key (must be ours + actually uploaded).
    let screenshotKey: string | null = null;
    if (parsed.data.screenshotKey) {
        const prefix = `feedback/${parsed.data.trackId}/`;
        if (!parsed.data.screenshotKey.startsWith(prefix)) {
            return apiError("INVALID_SCREENSHOT_KEY", "Screenshot key is not valid for this track", 400);
        }
        const stat = await statApkInR2(parsed.data.screenshotKey);
        if (!stat) return apiError("SCREENSHOT_NOT_FOUND", "Screenshot was not uploaded", 400);
        if (stat.size > MAX_SCREENSHOT_BYTES) {
            return apiError("SCREENSHOT_TOO_LARGE", "Screenshot exceeds 10MB", 400);
        }
        screenshotKey = parsed.data.screenshotKey;
    }

    const { error } = await admin.from("beta_feedback").insert({
        track_id: parsed.data.trackId,
        wallet_hash: session.walletHash,
        message: parsed.data.message,
        screenshot_key: screenshotKey,
        app_version_code: parsed.data.appVersionCode ?? null,
    });
    if (error) return apiError("DB_ERROR", "Failed to save feedback", 500);

    return NextResponse.json({ ok: true });
}
