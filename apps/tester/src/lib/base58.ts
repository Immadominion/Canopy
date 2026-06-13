/**
 * Minimal base58 (Bitcoin alphabet) encode — dependency-free, sufficient for
 * encoding 32-byte public keys and 64-byte signatures for the Canopy SIWS
 * verify endpoint. For heavy use prefer the `bs58` package.
 */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function toBase58(bytes: Uint8Array): string {
    let num = 0n;
    for (const byte of bytes) {
        num = num * 256n + BigInt(byte);
    }
    let encoded = "";
    while (num > 0n) {
        encoded = ALPHABET[Number(num % 58n)] + encoded;
        num = num / 58n;
    }
    // Preserve leading zero bytes as leading '1's.
    for (const byte of bytes) {
        if (byte !== 0) break;
        encoded = "1" + encoded;
    }
    return encoded;
}

/** Decode a base64 string (MWA returns addresses base64-encoded) to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
    const binary = globalThis.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Encode bytes to a base64 string (MWA signMessages payloads are base64). */
export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    return globalThis.btoa(binary);
}
