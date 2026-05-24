/**
 * Validates an API key against the KV store.
 * API keys are stored as bcrypt hashes in Supabase but the KV cache
 * stores the key_prefix → { publisherId, appId, scope, revokedAt } for fast lookup.
 *
 * KV key format: `apikey:${keyPrefix}` (first 8 chars of the key)
 * TTL: 60 seconds (allows near-real-time revocation)
 */
export async function validateApiKey(
    apiKey: string,
    appId: string,
    kvNamespace: KVNamespace,
): Promise<{ valid: boolean; publisherId: string }> {
    if (!apiKey.startsWith("cny_")) {
        return { valid: false, publisherId: "" };
    }

    const keyPrefix = apiKey.slice(0, 12); // "cny_" + 8 chars
    const kvKey = `apikey:${keyPrefix}`;

    const cachedRaw = await kvNamespace.get(kvKey);
    if (!cachedRaw) {
        // Key not in cache — not found or revoked
        return { valid: false, publisherId: "" };
    }

    let cached: { publisherId: string; appIds: string[]; revokedAt: string | null };
    try {
        cached = JSON.parse(cachedRaw) as typeof cached;
    } catch {
        return { valid: false, publisherId: "" };
    }

    // Check revocation
    if (cached.revokedAt) {
        return { valid: false, publisherId: "" };
    }

    // Check app scope (key must be authorized for this app)
    if (!cached.appIds.includes(appId) && !cached.appIds.includes("*")) {
        return { valid: false, publisherId: "" };
    }

    return { valid: true, publisherId: cached.publisherId };
}
