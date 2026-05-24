"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@canopy/types";

/**
 * Creates a Supabase client for use in Client Components.
 * Reads session from httpOnly cookies via SSR.
 */
export function createSupabaseBrowserClient() {
    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
        );
    }

    return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
