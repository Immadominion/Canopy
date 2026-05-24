/**
 * Seeker Genesis Token on-chain verification via Helius DAS API.
 *
 * The Seeker is the third Solana Mobile device. Its Genesis Token is a
 * non-transferable soulbound NFT minted to verified Seeker device owners
 * via the dApp Store on initial device setup.
 *
 * Canopy uses this check to populate the `is_seeker` field on install_events
 * and analytics_events, and to enforce `seeker_only` beta tracks.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * CONFIRMED CONSTANTS (Saga device, for reference):
 *
 *   Saga Genesis Token Collection NFT: 46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC
 *   Source: https://docs.solanamobile.com/getting-started/saga-genesis-token
 *
 *   Chapter 2 Preorder Token Mint: 2DMMamkkxQ6zDMBtkFp8KH7FoWzBMBA1CGTYwom4QH6Z
 *   Source: https://docs.solanamobile.com/getting-started/chapter-two-nft
 *
 * UNCONFIRMED CONSTANTS — requires research during implementation:
 *
 *   SEEKER_GENESIS_TOKEN_COLLECTION — The Metaplex collection NFT address for
 *   Seeker device Genesis Tokens. As of the time of writing, this address is
 *   not publicly documented for the Seeker (third Solana Mobile device).
 *   Set to null below; update once confirmed from official Solana Mobile docs
 *   or the solana-mobile GitHub repositories.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * @see docs/ARCHITECTURE.md §6 "Seeker Genesis Token Check"
 */

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "seeker-token" });

/**
 * Saga Genesis Token collection (confirmed). Used for reference only.
 * The Seeker has its own separate collection address.
 */
export const SAGA_GENESIS_TOKEN_COLLECTION =
    "46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC" as const;

/**
 * NOT YET CONFIRMED — requires research during implementation.
 * The Metaplex collection NFT address for Seeker device Genesis Tokens.
 * Set to null until confirmed from official Solana Mobile documentation.
 */
const SEEKER_GENESIS_TOKEN_COLLECTION: string | null = null;

/** In-memory LRU-style TTL cache: wallet_hash → { result, expiresAt } */
const cache = new Map<string, { result: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — per ARCHITECTURE.md §6

/**
 * Check whether a wallet owns a Seeker Genesis Token.
 *
 * Returns `false` (not `null`) when the collection address is not yet confirmed
 * so that `seeker_only` tracks continue to gate correctly. Once the address is
 * confirmed, set `SEEKER_GENESIS_TOKEN_COLLECTION` above.
 *
 * Result is cached per wallet_hash for CACHE_TTL_MS to avoid hammering the RPC.
 *
 * @param walletAddress  The tester's base58 Solana wallet address.
 * @param walletHash     SHA-256 of walletAddress (used as cache key — never plain).
 */
export async function hasSeekerGenesisToken(
    walletAddress: string,
    walletHash: string,
): Promise<boolean> {
    // Check cache first
    const cached = cache.get(walletHash);
    if (cached && cached.expiresAt > Date.now()) {
        log.debug({ walletHash, result: cached.result }, "Seeker Genesis Token check (cache hit)");
        return cached.result;
    }

    if (!SEEKER_GENESIS_TOKEN_COLLECTION) {
        log.warn(
            "SEEKER_GENESIS_TOKEN_COLLECTION is not set — Seeker Genesis Token check is disabled; returning false",
        );
        return false;
    }

    const rpcUrl = env.HELIUS_API_KEY
        ? `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`
        : env.SOLANA_RPC_URL;

    let response: Response;
    try {
        response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "canopy-seeker-check",
                method: "searchAssets",
                params: {
                    ownerAddress: walletAddress,
                    grouping: ["collection", SEEKER_GENESIS_TOKEN_COLLECTION],
                    page: 1,
                    limit: 1,
                },
            }),
        });
    } catch (err) {
        log.error({ err, walletHash }, "DAS searchAssets request failed for Seeker Genesis Token check");
        return false;
    }

    if (!response.ok) {
        log.warn(
            { status: response.status, walletHash },
            "DAS API returned non-200 for Seeker Genesis Token check",
        );
        return false;
    }

    let json: unknown;
    try {
        json = await response.json();
    } catch {
        log.warn({ walletHash }, "Failed to parse DAS API response for Seeker Genesis Token check");
        return false;
    }

    const total = (json as { result?: { total?: number } }).result?.total ?? 0;
    const hasToken = total > 0;

    // Write to cache
    cache.set(walletHash, { result: hasToken, expiresAt: Date.now() + CACHE_TTL_MS });
    log.debug({ walletHash, hasToken }, "Seeker Genesis Token check (RPC result cached)");

    return hasToken;
}
