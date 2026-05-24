/**
 * Publisher on-chain verification via Helius DAS API.
 *
 * Primary path: check `publishers.kyc_verified` in DB (handled by requireVerifiedPublisher).
 * Secondary path (stale-flag refresh): query the dApp Store Publisher Portal API.
 * Tertiary path (fallback): check whether the wallet owns any App NFTs from the
 *   Solana Mobile dApp Store program on-chain.
 *
 * @see docs/ARCHITECTURE.md §6 "Publisher Verification"
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * UNCONFIRMED CONSTANTS — requires research during implementation:
 *
 *   DAPP_STORE_APP_NFT_COLLECTION — The Metaplex collection NFT address for
 *   App NFTs minted by the Solana Mobile dApp Store CLI. As of the time of
 *   writing, this address is not publicly documented in the dApp Store docs or
 *   the solana-mobile GitHub repositories. It must be confirmed before this
 *   fallback is relied upon in production.
 *
 *   PUBLISHER_PORTAL_API_BASE — The Solana Mobile dApp Store Publisher Portal
 *   REST API base URL. As of the time of writing, the publisher portal
 *   (https://publish.solanamobile.com) does not appear to expose a public REST
 *   API for third-party verification queries. This path is reserved for a future
 *   integration if Solana Mobile publishes an API.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "publisher-verification" });

/**
 * NOT YET CONFIRMED — requires research during implementation.
 * The Metaplex collection NFT address for App NFTs minted via the dApp Store CLI.
 * Set to null to disable the on-chain fallback until the address is confirmed.
 */
const DAPP_STORE_APP_NFT_COLLECTION: string | null = null;

/**
 * Check whether a wallet owns at least one App NFT from the Solana Mobile
 * dApp Store program. Uses the Helius DAS `searchAssets` API.
 *
 * Returns `null` when the collection address is not yet confirmed so that
 * callers can distinguish "no NFT found" from "check not possible".
 *
 * @param walletAddress  The publisher's base58 Solana wallet address.
 */
export async function checkPublisherAppNft(
    walletAddress: string,
): Promise<boolean | null> {
    if (!DAPP_STORE_APP_NFT_COLLECTION) {
        log.warn(
            "DAPP_STORE_APP_NFT_COLLECTION is not set — on-chain publisher fallback is disabled",
        );
        return null;
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
                id: "canopy-publisher-check",
                method: "searchAssets",
                params: {
                    ownerAddress: walletAddress,
                    grouping: ["collection", DAPP_STORE_APP_NFT_COLLECTION],
                    page: 1,
                    limit: 1,
                },
            }),
        });
    } catch (err) {
        log.error({ err }, "DAS searchAssets request failed for publisher App NFT check");
        return null;
    }

    if (!response.ok) {
        log.warn({ status: response.status }, "DAS API returned non-200 for publisher App NFT check");
        return null;
    }

    let json: unknown;
    try {
        json = await response.json();
    } catch {
        log.warn("Failed to parse DAS API response for publisher App NFT check");
        return null;
    }

    const total = (json as { result?: { total?: number } }).result?.total ?? 0;
    return total > 0;
}
