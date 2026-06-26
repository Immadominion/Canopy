import bcrypt from "bcryptjs";

import { withDb } from "../db/client";
import { effectiveEventsLimit } from "../lib/plan";
import type { Env } from "../types";

/**
 * Validates an API key for a given app.
 *
 * Read-through cache. A KV hit is fast. On a miss we validate against the DB
 * (bcrypt-compare the key, load its publisher, the org's live plan, and the apps
 * the key may write to) and write the result back to KV with a short TTL, so
 * plan changes and revocations take effect within that TTL. This means nothing
 * external has to sync keys into KV.
 *
 * Keys are `cnp_live_...`; the stored key_prefix is the first 16 chars.
 */

const KV_TTL_SECONDS = 60;
const PREFIX_LEN = 16; // "cnp_live_" (9) + 7 hex

interface CachedKey {
    publisherId: string;
    appIds: string[]; // app UUIDs this key may write to (resolved, never "*")
    eventsLimit: number; // effective monthly events cap, -1 = unlimited
    revokedAt: string | null;
}

export interface ApiKeyValidation {
    valid: boolean;
    publisherId: string;
    eventsLimit: number;
}

const INVALID: ApiKeyValidation = { valid: false, publisherId: "", eventsLimit: 0 };

export async function validateApiKey(
    apiKey: string,
    appId: string,
    env: Env,
): Promise<ApiKeyValidation> {
    if (!apiKey.startsWith("cnp_live_")) return INVALID;

    const prefix = apiKey.slice(0, PREFIX_LEN);
    const kvKey = `apikey:${prefix}`;

    const cachedRaw = await env.API_KEYS_KV.get(kvKey);
    if (cachedRaw) {
        try {
            return finish(JSON.parse(cachedRaw) as CachedKey, appId);
        } catch {
            // corrupt cache entry — fall through to a fresh DB lookup
        }
    }

    let cached: CachedKey | null;
    try {
        cached = await loadKeyFromDb(apiKey, prefix, env);
    } catch (err) {
        console.error("[ingest] api-key DB validation failed:", err);
        return INVALID;
    }
    if (!cached) return INVALID;

    // Best-effort write-back so the next request is a fast cache hit.
    await env.API_KEYS_KV.put(kvKey, JSON.stringify(cached), { expirationTtl: KV_TTL_SECONDS });

    return finish(cached, appId);
}

function finish(cached: CachedKey, appId: string): ApiKeyValidation {
    if (cached.revokedAt) return INVALID;
    if (!cached.appIds.includes(appId)) return INVALID;
    return { valid: true, publisherId: cached.publisherId, eventsLimit: cached.eventsLimit };
}

async function loadKeyFromDb(apiKey: string, prefix: string, env: Env): Promise<CachedKey | null> {
    return withDb(env, async (client) => {
        const { rows } = await client.query<{
            publisher_id: string;
            app_id: string | null;
            org_id: string | null;
            key_hash: string;
            revoked_at: string | null;
        }>(
            `SELECT publisher_id, app_id, org_id, key_hash, revoked_at
               FROM api_keys WHERE key_prefix = $1`,
            [prefix],
        );

        const match = rows.find((r) => bcrypt.compareSync(apiKey, r.key_hash));
        if (!match) return null;

        // Org's live plan → effective monthly events limit.
        let eventsLimit = effectiveEventsLimit(null);
        if (match.org_id) {
            const { rows: orgRows } = await client.query<{
                plan: string | null;
                subscription_status: string | null;
                current_period_end: string | null;
            }>(
                `SELECT plan, subscription_status, current_period_end
                   FROM organizations WHERE id = $1`,
                [match.org_id],
            );
            eventsLimit = effectiveEventsLimit(orgRows[0] ?? null);
        }

        // app_id set = scoped to that one app; null = any of the publisher's apps.
        let appIds: string[];
        if (match.app_id) {
            appIds = [match.app_id];
        } else {
            const { rows: appRows } = await client.query<{ id: string }>(
                `SELECT id FROM apps WHERE publisher_id = $1`,
                [match.publisher_id],
            );
            appIds = appRows.map((a) => a.id);
        }

        return {
            publisherId: match.publisher_id,
            appIds,
            eventsLimit,
            revokedAt: match.revoked_at,
        };
    });
}
