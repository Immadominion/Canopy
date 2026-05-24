/**
 * Cohort evaluator — server-side on-chain cohort membership check.
 *
 * This module is ONLY used in contexts where we have the plaintext wallet
 * address (i.e., during the SIWS install gate check flow). Never call this
 * with a wallet_hash; always use the base58 wallet address.
 *
 * For runtime remote-config evaluation (SDK-side), cohort membership is
 * evaluated on-device via the SDK using Helius DAS API directly.
 */

import type { CohortCondition, CohortCriteria } from "@canopy/types";

import { env } from "@/lib/env";

// ─── Helius DAS API types ────────────────────────────────────────────────────

interface DasAsset {
    interface: string;
    id: string;
    grouping?: Array<{ group_key: string; group_value: string }>;
    token_info?: {
        balance?: number;
        decimals?: number;
        mint?: string;
    };
}

interface DasResponse {
    result: {
        items: DasAsset[];
        total: number;
        limit: number;
        page: number;
    };
}

// ─── Helius DAS fetch ────────────────────────────────────────────────────────

/**
 * Fetch all assets (NFTs + fungible tokens) owned by a wallet via Helius DAS.
 * Uses getAssetsByOwner with showFungible + showNativeBalance.
 * Paginates if there are more than 1000 assets.
 */
async function fetchWalletAssets(walletAddress: string): Promise<DasAsset[]> {
    const rpcUrl = env.SOLANA_RPC_URL;
    const allItems: DasAsset[] = [];
    let page = 1;

    while (true) {
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: `canopy-cohort-${page}`,
                method: "getAssetsByOwner",
                params: {
                    ownerAddress: walletAddress,
                    page,
                    limit: 1000,
                    options: {
                        showFungible: true,
                        showNativeBalance: false,
                        showUnverifiedCollections: false,
                        showCollectionMetadata: false,
                        showGrandTotal: false,
                        showInscription: false,
                        showZeroBalance: false,
                    },
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Helius DAS request failed: ${response.status}`);
        }

        const data = (await response.json()) as DasResponse;
        const items = data.result?.items ?? [];
        allItems.push(...items);

        // Stop if we received fewer items than the limit (last page)
        if (items.length < 1000) break;

        page++;
        // Safety cap at 10 pages (10,000 assets) — wallets with more than this
        // are edge cases and not relevant for cohort membership checks.
        if (page > 10) break;
    }

    return allItems;
}

// ─── Condition evaluators ────────────────────────────────────────────────────

function evaluateSeekerOnly(
    assets: DasAsset[],
    seekerGenesisMint: string | undefined,
): boolean {
    if (!seekerGenesisMint) {
        // Seeker Genesis Token mint address not yet confirmed — see docs/ARCHITECTURE.md
        // Returns false until confirmed. Do not guess the address.
        return false;
    }
    return assets.some(
        (a) =>
            a.grouping?.some(
                (g) => g.group_key === "collection" && g.group_value === seekerGenesisMint,
            ) ?? false,
    );
}

function evaluateHasGenesisToken(
    assets: DasAsset[],
    genesisMint: string | undefined,
): boolean {
    if (!genesisMint) {
        // Genesis Token collection address not yet confirmed — see docs/ARCHITECTURE.md
        return false;
    }
    return assets.some(
        (a) =>
            a.grouping?.some(
                (g) => g.group_key === "collection" && g.group_value === genesisMint,
            ) ?? false,
    );
}

function evaluateSkrBalanceTier(
    assets: DasAsset[],
    minTier: string,
    skrMint: string | undefined,
): boolean {
    if (!skrMint) {
        // SKR token mint address not yet confirmed — see docs/ARCHITECTURE.md
        return false;
    }
    const tierThresholds: Record<string, number> = {
        low: 1_000_000, // 1 SKR (assuming 6 decimals)
        medium: 10_000_000, // 10 SKR
        high: 100_000_000, // 100 SKR
    };
    const threshold = tierThresholds[minTier] ?? Number.MAX_SAFE_INTEGER;
    const skrAsset = assets.find(
        (a) => a.token_info?.mint === skrMint || a.id === skrMint,
    );
    const balance = skrAsset?.token_info?.balance ?? 0;
    return balance >= threshold;
}

function evaluateNftCollection(
    assets: DasAsset[],
    collectionMint: string,
    minCount: number,
): boolean {
    const count = assets.filter(
        (a) =>
            a.grouping?.some(
                (g) => g.group_key === "collection" && g.group_value === collectionMint,
            ) ?? false,
    ).length;
    return count >= minCount;
}

function evaluateCondition(condition: CohortCondition, assets: DasAsset[]): boolean {
    switch (condition.type) {
        case "seeker_only":
            return evaluateSeekerOnly(assets, process.env["SEEKER_GENESIS_TOKEN_MINT"]);

        case "has_genesis_token":
            return evaluateHasGenesisToken(assets, process.env["GENESIS_TOKEN_COLLECTION_MINT"]);

        case "skr_balance_tier":
            return evaluateSkrBalanceTier(assets, condition.min_tier, process.env["SKR_TOKEN_MINT"]);

        case "nft_collection":
            return evaluateNftCollection(assets, condition.collection_mint, condition.min_count ?? 1);
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate whether a wallet satisfies a cohort definition.
 *
 * @param walletAddress — base58 plaintext wallet address (never a hash).
 *   Only call this when you have the plaintext address (e.g., after SIWS verify).
 * @param criteria — cohort criteria to evaluate.
 * @returns true if the wallet satisfies the criteria.
 */
export async function evaluateCohort(
    walletAddress: string,
    criteria: CohortCriteria,
): Promise<boolean> {
    const { operator, conditions } = criteria;

    if (conditions.length === 0) return true;

    const assets = await fetchWalletAssets(walletAddress);

    if (operator === "or") {
        return conditions.some((c) => evaluateCondition(c, assets));
    }
    // Default: "and"
    return conditions.every((c) => evaluateCondition(c, assets));
}

/**
 * Evaluate a single cohort condition for a given wallet.
 * Useful for gate checks on individual conditions.
 */
export async function evaluateSingleCondition(
    walletAddress: string,
    condition: CohortCondition,
): Promise<boolean> {
    const assets = await fetchWalletAssets(walletAddress);
    return evaluateCondition(condition, assets);
}
