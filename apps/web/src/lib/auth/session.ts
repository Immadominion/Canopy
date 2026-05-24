import { cache } from "react";

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

/**
 * Resolves the wallet associated with the current Supabase session, or null
 * if the request is unauthenticated. Memoised per-request via React `cache`.
 */
export const getSessionWallet = cache(async (): Promise<SessionWallet | null> => {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const walletAddress = (user.user_metadata as { wallet_address?: unknown })["wallet_address"];
    if (typeof walletAddress !== "string" || walletAddress.length === 0) return null;

    return { walletAddress, walletHash: hashWalletAddress(walletAddress) };
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
