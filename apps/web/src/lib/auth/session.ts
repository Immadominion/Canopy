import { cache } from "react";
import { headers } from "next/headers";

import type { Publisher } from "@canopy/types";

import { hashWalletAddress } from "@/lib/auth/siws";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Internal: the wallet address is stored as a custom claim on the Supabase
 * Auth user (`user.user_metadata.wallet_address`) after SIWS verification.
 */
interface SessionWallet {
    walletAddress: string;
    walletHash: string;
}

/** Pull `wallet_address` out of a Supabase user's metadata, if present + valid. */
function walletFromMetadata(metadata: unknown): string | null {
    const walletAddress = (metadata as { wallet_address?: unknown })?.["wallet_address"];
    return typeof walletAddress === "string" && walletAddress.length > 0 ? walletAddress : null;
}

/**
 * Resolves the wallet associated with the current request, or null if
 * unauthenticated. Memoised per-request via React `cache`.
 *
 * Two credentials are accepted:
 *  1. The httpOnly Supabase cookie session (web app).
 *  2. An `Authorization: Bearer <access_token>` header (the native Canopy
 *     tester app, which can't use cookies). The token is verified with the
 *     admin client; same wallet-from-metadata claim.
 */
export const getSessionWallet = cache(async (): Promise<SessionWallet | null> => {
    // 1. Cookie session (web).
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const cookieWallet = user ? walletFromMetadata(user.user_metadata) : null;
    if (cookieWallet) {
        return { walletAddress: cookieWallet, walletHash: hashWalletAddress(cookieWallet) };
    }

    // 2. Bearer token (native app).
    const authHeader = (await headers()).get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice("Bearer ".length).trim();
        if (token) {
            const admin = createSupabaseAdminClient();
            const {
                data: { user: bearerUser },
            } = await admin.auth.getUser(token);
            const bearerWallet = bearerUser ? walletFromMetadata(bearerUser.user_metadata) : null;
            if (bearerWallet) {
                return { walletAddress: bearerWallet, walletHash: hashWalletAddress(bearerWallet) };
            }
        }
    }

    return null;
});

/**
 * Resolves the publisher row for the currently signed-in wallet, or null if
 * the wallet has no publisher record yet (i.e. they are a tester, not a publisher).
 */
export const getCurrentPublisher = cache(async (): Promise<Publisher | null> => {
    const session = await getSessionWallet();
    if (!session) return null;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from("publishers")
        .select("*")
        .eq("wallet_hash", session.walletHash)
        .maybeSingle();

    if (error) return null;
    return data;
});

/**
 * Requires a KYC-verified publisher for the route.
 *
 * INVARIANT 1: only wallets with `publishers.kyc_verified === true` may
 * create or modify beta tracks. There are NO env / dev shortcuts.
 *
 * Returns a tagged result so callers can produce the right HTTP status:
 *  - `unauthenticated`  -> 401
 *  - `not_publisher`    -> 403
 *  - `kyc_required`     -> 403
 *  - `ok`               -> proceed with `publisher`
 */
export async function requireVerifiedPublisher(): Promise<
    | { status: "unauthenticated" }
    | { status: "not_publisher" }
    | { status: "kyc_required"; publisher: Publisher }
    | { status: "ok"; publisher: Publisher; walletHash: string }
> {
    const session = await getSessionWallet();
    if (!session) return { status: "unauthenticated" };

    const publisher = await getCurrentPublisher();
    if (!publisher) return { status: "not_publisher" };
    if (!publisher.kyc_verified) return { status: "kyc_required", publisher };

    return { status: "ok", publisher, walletHash: session.walletHash };
}
