import { Connection, PublicKey } from "@solana/web3.js";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * On-chain USDC billing provider (pay-to-extend).
 *
 * No Solana program, no recurring auto-pull: the customer sends a one-time USDC
 * transfer to the merchant wallet, and the server verifies that transaction
 * on-chain here. Kept behind this small surface so a managed provider (e.g.
 * Sphere Pay) can be slotted in later without touching the routes/UI.
 *
 * Disabled (returns null/false) whenever the merchant wallet is unset/invalid —
 * so the app never crashes when billing isn't configured.
 */

const log = logger.child({ module: "billing-provider" });

export interface BillingConfig {
    merchantWallet: PublicKey;
    usdcMint: PublicKey;
    cluster: "mainnet-beta" | "devnet";
    rpcUrl: string;
}

function tryPublicKey(value: string | undefined): PublicKey | null {
    if (!value) return null;
    try {
        return new PublicKey(value.trim());
    } catch {
        return null;
    }
}

export function getBillingConfig(): BillingConfig | null {
    const merchant = tryPublicKey(env.CANOPY_MERCHANT_WALLET);
    const usdc = tryPublicKey(env.USDC_MINT);
    if (!merchant || !usdc) return null;
    return {
        merchantWallet: merchant,
        usdcMint: usdc,
        cluster: env.SOLANA_CLUSTER,
        rpcUrl: env.SOLANA_RPC_URL,
    };
}

export function billingEnabled(): boolean {
    return getBillingConfig() !== null;
}

export interface VerifiedPayment {
    amountBaseUnits: bigint;
    /** Owner of the USDC account that the funds left (the actual sender). */
    sourceOwner: string | null;
    /** Fee payer / first signer of the transaction (fallback identity). */
    feePayer: string | null;
}

/**
 * Verify that a confirmed Solana transaction transferred at least
 * `minAmountBaseUnits` of USDC into the merchant wallet. Returns the verified
 * amount + payer, or null if the tx is missing, failed, wrong mint/recipient,
 * or short. Idempotency (one signature = one application) is enforced by the
 * caller via the unique `tx_signature` column.
 */
export async function verifyUsdcPayment(opts: {
    signature: string;
    minAmountBaseUnits: bigint;
}): Promise<VerifiedPayment | null> {
    const cfg = getBillingConfig();
    if (!cfg) return null;

    const connection = new Connection(cfg.rpcUrl, "confirmed");

    let tx;
    try {
        tx = await connection.getParsedTransaction(opts.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
        });
    } catch (err) {
        log.warn({ err, signature: opts.signature }, "getParsedTransaction failed");
        return null;
    }

    if (!tx || tx.meta?.err) return null;

    const merchant = cfg.merchantWallet.toBase58();
    const usdc = cfg.usdcMint.toBase58();
    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];

    // Largest USDC balance increase on an account owned by the merchant.
    let delta = 0n;
    // Largest USDC balance DECREASE on a non-merchant account = the sender.
    let sourceOwner: string | null = null;
    let maxDrop = 0n;

    const balanceAt = (index: number, list: typeof pre): bigint => {
        const e = list.find((b) => b.accountIndex === index);
        return BigInt(e?.uiTokenAmount.amount ?? "0");
    };

    for (const p of post) {
        if (p.mint !== usdc) continue;
        const beforeAmt = balanceAt(p.accountIndex, pre);
        const afterAmt = BigInt(p.uiTokenAmount.amount ?? "0");
        if (p.owner === merchant) {
            const d = afterAmt - beforeAmt;
            if (d > delta) delta = d;
        } else if (p.owner) {
            const drop = beforeAmt - afterAmt;
            if (drop > maxDrop) {
                maxDrop = drop;
                sourceOwner = p.owner;
            }
        }
    }

    if (delta < opts.minAmountBaseUnits) return null;

    const feePayer =
        tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58() ?? null;

    return { amountBaseUnits: delta, sourceOwner, feePayer };
}
