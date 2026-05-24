/**
 * Irys / Arweave upload helper.
 *
 * Used to write immutable fingerprint records when beta tracks are created,
 * testers are authorised, and installs are authorised.
 *
 * Rules (copilot-instructions §11):
 *  - Do not block user-facing operations — always call async and non-blocking
 *  - Records contain only hashed / non-sensitive identifiers (no wallet addresses, no R2 keys)
 *  - Uploads < 100 KiB are free on Irys — all our records are well under that limit
 */

import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";

import { env } from "@/lib/env";

interface IrysTag {
    name: string;
    value: string;
}

async function getIrysUploader() {
    if (env.IRYS_NETWORK === "devnet") {
        // devnet() must be called in the builder chain before resolution, not after.
        // withRpc() is mandatory for devnet per Irys docs.
        return Uploader(Solana)
            .withWallet(env.IRYS_PRIVATE_KEY)
            .withRpc(env.SOLANA_RPC_URL)
            .devnet();
    }
    return Uploader(Solana).withWallet(env.IRYS_PRIVATE_KEY);
}

/**
 * Writes a JSON record to Arweave via Irys.
 * Returns the Arweave transaction ID on success.
 * Throws on failure — callers should catch and treat as non-fatal.
 */
export async function writeArweaveRecord(
    data: Record<string, unknown>,
    tags: IrysTag[] = [],
): Promise<string> {
    const irys = await getIrysUploader();
    const payload = JSON.stringify(data);
    const receipt = await irys.upload(payload, {
        tags: [
            { name: "Content-Type", value: "application/json" },
            { name: "App-Name", value: "canopy" },
            ...tags,
        ],
    });
    return receipt.id;
}

/**
 * Writes the `canopy_beta_track_created` fingerprint record.
 * Call fire-and-forget after track creation — do NOT await in the request handler.
 */
export async function writeTrackCreatedRecord(opts: {
    trackId: string;
    apkSha256: string;
    publisherWalletHash: string;
    expiresAt: string;
}): Promise<string> {
    return writeArweaveRecord(
        {
            type: "canopy_beta_track_created",
            trackId: opts.trackId,
            apkSha256: opts.apkSha256,
            publisherWalletHash: opts.publisherWalletHash,
            expiresAt: opts.expiresAt,
            timestamp: new Date().toISOString(),
        },
        [
            { name: "canopy:type", value: "canopy_beta_track_created" },
            { name: "canopy:track-id", value: opts.trackId },
        ],
    );
}
