import { env } from "@/lib/env";
import { getSessionWallet } from "@/lib/auth/session";

/**
 * Admin allowlist — the founder's own SHA-256 wallet hash(es), comma-separated
 * in ADMIN_WALLET_HASHES. This is the API fallback for approving access
 * requests when the Telegram bot path isn't used. Empty/unset = closed.
 *
 * Parsed once and cached. Only well-formed 64-char hex SHA-256 hashes are
 * accepted; malformed entries are dropped with a warning so a typo can't
 * silently widen (or, via a never-matching garbage entry, mask) the allowlist.
 */
const adminHashes: ReadonlySet<string> = (() => {
    const raw = env.ADMIN_WALLET_HASHES;
    if (!raw) return new Set<string>();
    const entries = raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const valid = entries.filter((h) => /^[0-9a-f]{64}$/.test(h));
    if (valid.length !== entries.length) {
        console.warn(
            "[canopy] ADMIN_WALLET_HASHES: ignored malformed entries (expected 64-char hex SHA-256)",
        );
    }
    return new Set(valid);
})();

export function isAdminWalletHash(walletHash: string): boolean {
    return adminHashes.has(walletHash.toLowerCase());
}

/**
 * Gate for admin-only routes. Returns 401 when unauthenticated, 403 when the
 * signed-in wallet is not on the allowlist.
 */
export async function requireAdmin(): Promise<
    { ok: true; walletHash: string } | { ok: false; status: 401 | 403 }
> {
    const session = await getSessionWallet();
    if (!session) return { ok: false, status: 401 };
    if (!isAdminWalletHash(session.walletHash)) return { ok: false, status: 403 };
    return { ok: true, walletHash: session.walletHash };
}
