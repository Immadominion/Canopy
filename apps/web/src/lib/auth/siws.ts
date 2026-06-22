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

export type SIWSValidationResult =
    | { ok: true }
    | { ok: false; reason: "MALFORMED" | "DOMAIN" | "ADDRESS" | "NONCE" | "EXPIRED" };

/**
 * Server-side validation of a client-supplied SIWS message.
 *
 * The client controls the entire `message` string it asks the wallet to sign,
 * so a valid Ed25519 signature only proves "this wallet signed THIS text" — not
 * that the text authorizes a Canopy sign-in. This re-derives the security-
 * critical fields from the message body and checks them:
 *
 *  - `domain` must be one WE control. This blocks cross-site signature reuse:
 *    a malicious site that collects a signature over a Canopy nonce signs it for
 *    ITS OWN domain (the honest case), which we then reject.
 *  - the signed `address` must equal the wallet being authenticated (no
 *    "sign as A, log in as B").
 *  - the `Nonce` must equal the server-issued nonce we are consuming.
 *  - the message must not, by its own `Expiration Time`, already be expired.
 *
 * `allowedDomains` is passed IN (not read from env) so this module stays
 * import-safe for the client bundle, which builds messages via buildSIWSMessage.
 * Domain enforcement is skippable for local dev / preview, where the host varies
 * (localhost, LAN IP, tunnels); the nonce + address + signature checks always run.
 */
export function parseAndValidateSIWSMessage(params: {
    message: string;
    wallet: string;
    nonce: string;
    allowedDomains: string[];
    skipDomainCheck?: boolean;
    now?: number;
    /** Tolerance for the message's own "Issued At" being slightly in the future. */
    skewMs?: number;
}): SIWSValidationResult {
    const { message, wallet, nonce, allowedDomains, skipDomainCheck = false } = params;
    const now = params.now ?? Date.now();
    const skewMs = params.skewMs ?? 5 * 60 * 1000;

    const lines = message.replace(/\r\n/g, "\n").split("\n");
    const header = lines[0] ?? "";
    const headerMatch = header.match(/^(.+?) wants you to sign in with your Solana account:$/);
    const domain = headerMatch?.[1]?.trim();
    const address = lines[1]?.trim();

    const fieldValue = (label: string): string | undefined => {
        const prefix = `${label}: `;
        const line = lines.find((l) => l.startsWith(prefix));
        return line?.slice(prefix.length).trim();
    };
    const messageNonce = fieldValue("Nonce");
    const issuedAtRaw = fieldValue("Issued At");
    const expiresAtRaw = fieldValue("Expiration Time");

    if (!domain || !address || !messageNonce) return { ok: false, reason: "MALFORMED" };

    if (!skipDomainCheck && !allowedDomains.includes(domain)) return { ok: false, reason: "DOMAIN" };
    if (address !== wallet) return { ok: false, reason: "ADDRESS" };
    if (messageNonce !== nonce) return { ok: false, reason: "NONCE" };

    // Timestamps are secondary to the server-side single-use nonce TTL, but a
    // message that claims to already be expired must never be honoured, and one
    // claiming to be issued far in the future is malformed.
    if (expiresAtRaw) {
        const expiresAt = Date.parse(expiresAtRaw);
        if (Number.isNaN(expiresAt) || expiresAt <= now) return { ok: false, reason: "EXPIRED" };
    }
    if (issuedAtRaw) {
        const issuedAt = Date.parse(issuedAtRaw);
        if (Number.isNaN(issuedAt) || issuedAt > now + skewMs) return { ok: false, reason: "MALFORMED" };
    }

    return { ok: true };
}
