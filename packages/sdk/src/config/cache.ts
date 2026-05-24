/**
 * Remote Config cache — AsyncStorage-backed stale-while-revalidate store.
 *
 * Key format: `canopy:config:{appId}`
 * TTL: 5 minutes (configurable)
 * Strategy: serve stale immediately while refreshing in background.
 *
 * This module never throws — all errors are swallowed.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ConfigCacheEntry {
    values: Record<string, unknown>;
    fetchedAt: number; // Unix ms
}

function cacheKey(appId: string): string {
    return `canopy:config:${appId}`;
}

export async function readCache(appId: string): Promise<ConfigCacheEntry | null> {
    try {
        const raw = await AsyncStorage.getItem(cacheKey(appId));
        if (!raw) return null;
        return JSON.parse(raw) as ConfigCacheEntry;
    } catch {
        return null;
    }
}

export async function writeCache(appId: string, values: Record<string, unknown>): Promise<void> {
    try {
        const entry: ConfigCacheEntry = { values, fetchedAt: Date.now() };
        await AsyncStorage.setItem(cacheKey(appId), JSON.stringify(entry));
    } catch {
        // Storage write failure is non-fatal
    }
}

export function isStale(entry: ConfigCacheEntry, ttlMs = DEFAULT_TTL_MS): boolean {
    return Date.now() - entry.fetchedAt > ttlMs;
}
