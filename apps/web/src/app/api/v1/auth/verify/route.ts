import { NextResponse } from "next/server";
import { z } from "zod";

import { hashWalletAddress } from "@/lib/auth/siws";
import { verifyEd25519Signature } from "@/lib/auth/verify-signature";
import { logger } from "@/lib/logger";
import {
    createSupabaseAdminClient,
    createSupabaseServerClient,
} from "@/lib/supabase/server";

const log = logger.child({ route: "POST /api/v1/auth/verify" });

const verifySchema = z.object({
    wallet: z.string().min(32).max(44), // Solana base58 address
    signature: z.string().min(64).max(128), // base58 of 64 bytes
    message: z.string().min(1).max(4096),
    nonce: z.string().length(64),
});

/**
 * Derive a stable, opaque email for Supabase Auth from a wallet hash. The
 * local-part is the first 32 chars of the SHA-256(wallet) hex digest, giving
 * 128 bits of entropy and staying well within the RFC 5321 64-char limit.
 *
 * The email is never delivered — Supabase Auth is used purely as a session /
 * JWT issuer, with `email_confirm: true` set when creating users.
 */
function walletEmail(walletHash: string): string {
    return `${walletHash.slice(0, 32)}@wallet.canopy.internal`;
}

export async function POST(request: Request): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        log.warn("Received malformed JSON body");
        return NextResponse.json(
            { error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
            { status: 400 },
        );
    }

    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Invalid request body",
                    details: parsed.error.flatten().fieldErrors,
                },
            },
            { status: 400 },
        );
    }

    const { wallet, signature, message, nonce } = parsed.data;
    const admin = createSupabaseAdminClient();

    // 1. The signed message MUST embed the nonce we're consuming. Without this
    //    binding, a valid signature over an unrelated message could be replayed.
    if (!message.includes(nonce)) {
        return NextResponse.json(
            { error: { code: "INVALID_SIGNATURE", message: "Signature verification failed" } },
            { status: 401 },
        );
    }

    // 2. Validate and consume the nonce (single-use, 5-min TTL set at issue time).
    const { data: nonceRecord, error: nonceError } = await admin
        .from("siws_nonces")
        .select("nonce")
        .eq("nonce", nonce)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

    if (nonceError ?? !nonceRecord) {
        return NextResponse.json(
            { error: { code: "INVALID_NONCE", message: "Nonce is invalid, expired, or already used" } },
            { status: 401 },
        );
    }

    // Mark consumed immediately (before signature verification) to prevent
    // race-condition replay on parallel requests.
    await admin.from("siws_nonces").update({ used: true }).eq("nonce", nonce);

    // 3. Verify Ed25519 signature with native Web Crypto via @solana/kit.
    const isValidSig = await verifyEd25519Signature({
        walletAddress: wallet,
        signature,
        message,
    });
    if (!isValidSig) {
        return NextResponse.json(
            { error: { code: "INVALID_SIGNATURE", message: "Signature verification failed" } },
            { status: 401 },
        );
    }

    // 4. Resolve publisher row by wallet hash, creating it on first sign-in so
    //    the wallet is trackable for the access-request flow. New publishers
    //    start `unverified` (kyc_verified=false) and gain access only after
    //    manual approval — see lib/verification/access.ts.
    const walletHash = hashWalletAddress(wallet);

    await admin
        .from("publishers")
        .upsert(
            { wallet_address: wallet, wallet_hash: walletHash },
            { onConflict: "wallet_hash", ignoreDuplicates: true },
        );

    const { data: publisher } = await admin
        .from("publishers")
        .select("id, kyc_verified, plan")
        .eq("wallet_hash", walletHash)
        .maybeSingle();

    // 5. Create-or-find the Supabase Auth user, with wallet_address pinned to
    //    user_metadata so downstream session reads (lib/auth/session.ts) can
    //    recover the wallet without another DB round-trip.
    const email = walletEmail(walletHash);
    const createResult = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { wallet_address: wallet },
    });

    // `email_exists` is the expected path on re-auth — not an error.
    if (createResult.error && createResult.error.code !== "email_exists") {
        return NextResponse.json(
            { error: { code: "AUTH_FAILED", message: "Authentication failed" } },
            { status: 500 },
        );
    }

    // 6. Issue a magic link to obtain a single-use token_hash, then exchange it
    //    server-side for a real session. `verifyOtp` on the SSR server client
    //    writes the session cookies via the cookie adapter — that is what
    //    actually establishes the httpOnly Supabase session.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
    });

    if (linkError ?? !linkData.properties.hashed_token) {
        return NextResponse.json(
            { error: { code: "AUTH_FAILED", message: "Authentication failed" } },
            { status: 500 },
        );
    }

    const server = await createSupabaseServerClient();
    const { error: otpError } = await server.auth.verifyOtp({
        type: "email",
        token_hash: linkData.properties.hashed_token,
    });

    if (otpError) {
        return NextResponse.json(
            { error: { code: "AUTH_FAILED", message: "Authentication failed" } },
            { status: 500 },
        );
    }

    log.info(
        { walletHash, publisherId: publisher?.id ?? null, isPublisher: !!publisher },
        "SIWS verification succeeded",
    );

    // Native clients (the Canopy tester app) can't use the httpOnly cookie
    // session, so when `?client=mobile` is set we also return the Supabase
    // session tokens in the body for the app to persist in secure storage. The
    // web app ignores this and relies on the cookies written by verifyOtp above.
    const wantsMobileToken = new URL(request.url).searchParams.get("client") === "mobile";
    let mobileSession:
        | { accessToken: string; refreshToken: string; expiresAt: number | null }
        | null = null;
    if (wantsMobileToken) {
        const { data: sessionData } = await server.auth.getSession();
        const s = sessionData.session;
        if (s) {
            mobileSession = {
                accessToken: s.access_token,
                refreshToken: s.refresh_token,
                expiresAt: s.expires_at ?? null,
            };
        }
    }

    return NextResponse.json({
        authenticated: true,
        publisher: publisher
            ? { id: publisher.id, kycVerified: publisher.kyc_verified, plan: publisher.plan }
            : null,
        ...(mobileSession ? { session: mobileSession } : {}),
    });
}
