import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const log = logger.child({ route: "POST /api/v1/auth/sign-out" });

/**
 * POST /api/v1/auth/sign-out
 *
 * Signs the current user out by invalidating their Supabase session.
 * The Supabase client clears the session cookie automatically.
 * Returns 200 on success; callers should redirect to /sign-in.
 */
export async function POST(): Promise<NextResponse> {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    log.info("User signed out");

    return NextResponse.json({ ok: true });
}
