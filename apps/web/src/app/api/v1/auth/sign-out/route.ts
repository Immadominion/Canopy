import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

const log = logger.child({ route: "POST /api/v1/auth/sign-out" });

/**
 * POST /api/v1/auth/sign-out
 *
 * Signs the current user out. Beyond clearing the local cookie session, this
 * GLOBALLY revokes the user's refresh tokens (scope: "global") so a parallel or
 * stolen session — including the native app's Bearer/refresh token — can no
 * longer mint fresh access tokens. Best-effort: a revocation failure still
 * clears the local session and returns 200.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();

    // Resolve the caller's access token from either credential: the cookie
    // session (web) or the Authorization: Bearer header (native app).
    const {
        data: { session },
    } = await supabase.auth.getSession();
    let accessToken = session?.access_token ?? null;
    if (!accessToken) {
        const authHeader = request.headers.get("authorization");
        if (authHeader?.startsWith("Bearer ")) {
            accessToken = authHeader.slice("Bearer ".length).trim() || null;
        }
    }

    if (accessToken) {
        try {
            const admin = createSupabaseAdminClient();
            await admin.auth.admin.signOut(accessToken, "global");
        } catch (err) {
            log.warn({ err }, "Global sign-out revocation failed (continuing)");
        }
    }

    // Clear the local cookie session (web).
    await supabase.auth.signOut();
    log.info("User signed out");

    return NextResponse.json({ ok: true });
}
