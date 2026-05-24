import crypto from "crypto";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(): Promise<NextResponse> {
    const nonce = crypto.randomBytes(32).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);

    const supabase = createSupabaseAdminClient();

    // Store nonce in Supabase with TTL — single-use enforcement on verify
    const { error } = await supabase.from("siws_nonces").insert({
        nonce,
        expires_at: expiresAt.toISOString(),
        used: false,
    });

    if (error) {
        return NextResponse.json(
            { error: { code: "NONCE_CREATION_FAILED", message: "Failed to generate nonce" } },
            { status: 500 },
        );
    }

    return NextResponse.json(
        { nonce, expiresAt: expiresAt.toISOString() },
        {
            headers: {
                // Prevent caching of nonces
                "Cache-Control": "no-store",
            },
        },
    );
}
