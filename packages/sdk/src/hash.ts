/**
 * SHA-256 hash for wallet addresses.
 *
 * Uses the Web Crypto API (`globalThis.crypto.subtle`) which is available
 * natively in the Hermes engine shipped with React Native 0.73+.
 *
 * INVARIANT: The plaintext wallet address is hashed ON THE DEVICE.
 * The ingest service NEVER receives a plaintext wallet address.
 */
export async function hashWalletAddress(walletAddress: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(walletAddress);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", msgBuffer);
    return uint8ArrayToHex(new Uint8Array(hashBuffer));
}

function uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
