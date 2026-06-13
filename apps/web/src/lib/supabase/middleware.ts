import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@canopy/types";

/**
 * Middleware that refreshes expired Supabase sessions.
 * Must be called from Next.js middleware.ts.
 */
export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

    if (!supabaseUrl || !supabaseAnonKey) {
        return supabaseResponse;
    }

    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                supabaseResponse = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) =>
                    supabaseResponse.cookies.set(name, value, options),
                );
            },
        },
        auth: {
            // Server-side: no background refresh ticker / no session persistence.
            // The on-demand refresh inside getUser() still runs. This stops the
            // noisy background refresh attempts whose fetch to a local Supabase
            // flakes under the Edge runtime in dev.
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    });

    // Refresh session — do NOT remove this. Tolerate transient reachability
    // failures (local-dev Edge fetch to 127.0.0.1 can flake): never crash the
    // request or bounce a logged-in user; the page's own server-side auth
    // (getSessionWallet, on the Node runtime) makes the authoritative call.
    let user = null;
    try {
        const result = await supabase.auth.getUser();
        user = result.data.user;
    } catch {
        return supabaseResponse;
    }

    // Protected routes — redirect to sign-in if unauthenticated
    const isProtectedRoute =
        request.nextUrl.pathname.startsWith("/dashboard") ||
        request.nextUrl.pathname.startsWith("/apps") ||
        request.nextUrl.pathname.startsWith("/beta") ||
        request.nextUrl.pathname.startsWith("/analytics") ||
        request.nextUrl.pathname.startsWith("/crashes") ||
        request.nextUrl.pathname.startsWith("/settings");

    if (isProtectedRoute && !user) {
        const signInUrl = request.nextUrl.clone();
        signInUrl.pathname = "/sign-in";
        signInUrl.searchParams.set("redirected_from", request.nextUrl.pathname);
        return NextResponse.redirect(signInUrl);
    }

    return supabaseResponse;
}
