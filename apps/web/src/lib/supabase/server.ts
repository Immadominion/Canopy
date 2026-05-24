import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@canopy/types";

/**
 * Creates a Supabase client for use in Server Components and Route Handlers.
 * Reads session from httpOnly cookies automatically.
 */
export async function createSupabaseServerClient() {
    const cookieStore = await cookies();

    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
        );
    }

    return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options),
                    );
                } catch {
                    // Called from a Server Component — cookie mutations are no-ops.
                    // Middleware handles session refresh.
                }
            },
        },
    });
}

/**
 * Creates a Supabase admin client using the service role key.
 * NEVER expose this client to the browser. Only use in trusted server contexts.
 */
export function createSupabaseAdminClient() {
    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
            "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
        );
    }

    // Dynamic import to avoid bundling in client
    return createClient<Database>(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
