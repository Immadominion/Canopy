import crypto from "crypto";

/**
 * Generates a cryptographically secure SIWS nonce.
 * 32 bytes → 64 hex chars. Single-use. 5-minute TTL enforced by consumer.
 */
export function generateNonce(): string {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * SHA-256 hash a wallet address for storage.
 * Wallet addresses are NEVER stored in plaintext in analytics/tester tables.
 */
export function hashWalletAddress(walletAddress: string): string {
    return crypto.createHash("sha256").update(walletAddress).digest("hex");
}

/**
 * Builds the SIWS message string for signing.
 * Follows the Sign-In With Solana specification.
 */
export function buildSIWSMessage({
    domain,
    address,
    nonce,
    issuedAt,
    expiresAt,
    statement,
}: {
    domain: string;
    address: string;
    nonce: string;
    issuedAt: string;
    expiresAt: string;
    statement?: string;
}): string {
    const lines = [
        `${domain} wants you to sign in with your Solana account:`,
        address,
        "",
        statement ?? "Sign in to Canopy — Developer Infrastructure for Solana Mobile",
        "",
        `URI: https://${domain}`,
        "Version: 1",
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
        `Expiration Time: ${expiresAt}`,
    ];

    return lines.join("\n");
}
