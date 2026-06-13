import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSupabaseStatelessClient } from "@/lib/supabase/server";

const log = logger.child({ route: "POST /api/v1/auth/refresh" });

const refreshSchema = z.object({
    refreshToken: z.string().min(1).max(2048),
});

/**
 * Exchange a (rotating) Supabase refresh token for a fresh access token.
 *
 * The mobile tester app calls this when its access token has expired or a
 * request 401s, so a tester isn't bounced back to the connect screen on every
 * token expiry. Supabase rotates refresh tokens, so the response carries a NEW
 * refresh token the app must persist in place of the old one.
 *
 * No secrets cross the wire: the refresh token is a bearer credential the app
 * already holds, and the exchange runs against the public anon client.
 */
export async function POST(request: Request): Promise<NextResponse> {
    // Speed bump against refresh-token brute force / spray.
    const limit = rateLimit(`auth-refresh:${clientIp(request)}`, 30, 60_000);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many refresh attempts" } },
            { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
            { status: 400 },
        );
    }

    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: { code: "VALIDATION_ERROR", message: "Invalid request body" } },
            { status: 400 },
        );
    }

    const supabase = createSupabaseStatelessClient();
    const { data, error } = await supabase.auth.refreshSession({
        refresh_token: parsed.data.refreshToken,
    });

    const session = data.session;
    if (error || !session) {
        // Expired / revoked / already-rotated refresh token — the app should
        // treat this as a hard logout and re-run the SIWS handshake.
        log.info({ reason: error?.message ?? "no_session" }, "Refresh rejected");
        return NextResponse.json(
            { error: { code: "REFRESH_FAILED", message: "Could not refresh session" } },
            { status: 401 },
        );
    }

    return NextResponse.json({
        session: {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresAt: session.expires_at ?? null,
        },
    });
}
