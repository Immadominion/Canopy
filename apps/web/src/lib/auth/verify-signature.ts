/**
 * Ed25519 signature verification for SIWS (Sign-In With Solana).
 *
 * Uses native Web Crypto Ed25519 via `@solana/kit`'s `verifySignature`, which is
 * required by the project's on-chain policy (copilot-instructions §8 — use
 * `@solana/kit` v6.x exclusively for on-chain primitives).
 *
 * Inputs:
 *   - `walletAddress`: base58-encoded 32-byte Ed25519 public key (Solana address)
 *   - `signature`: base58-encoded 64-byte Ed25519 signature
 *   - `message`: the exact UTF-8 string the client signed
 *
 * Returns `true` only when the signature is a valid Ed25519 signature of the
 * UTF-8-encoded `message` under the public key encoded by `walletAddress`.
 * All parse/import failures resolve to `false` — never throw — so callers can
 * uniformly respond with a generic INVALID_SIGNATURE.
 */
import { getBase58Encoder, verifySignature, type SignatureBytes } from "@solana/kit";

const SOLANA_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

const base58 = getBase58Encoder();

export async function verifyEd25519Signature(params: {
    walletAddress: string;
    signature: string;
    message: string;
}): Promise<boolean> {
    const { walletAddress, signature, message } = params;

    let publicKeyBytes: Uint8Array;
    let signatureBytes: Uint8Array;
    try {
        publicKeyBytes = base58.encode(walletAddress) as Uint8Array;
        signatureBytes = base58.encode(signature) as Uint8Array;
    } catch {
        return false;
    }

    if (publicKeyBytes.length !== SOLANA_PUBLIC_KEY_BYTES) return false;
    if (signatureBytes.length !== ED25519_SIGNATURE_BYTES) return false;

    let publicKey: CryptoKey;
    try {
        publicKey = await crypto.subtle.importKey(
            "raw",
            publicKeyBytes as BufferSource,
            "Ed25519",
      /* extractable */ false,
            ["verify"],
        );
    } catch {
        return false;
    }

    const messageBytes = new TextEncoder().encode(message);

    try {
        return await verifySignature(publicKey, signatureBytes as SignatureBytes, messageBytes);
    } catch {
        return false;
    }
}
