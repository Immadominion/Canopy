/**
 * useRemoteConfig — resolves a single remote config key.
 *
 * Returns the cached or fetched value cast to type T.
 * Falls back to `defaultValue` if:
 *   - The config key does not exist
 *   - The network is unavailable and no cache entry exists
 *   - The SDK is not yet initialised
 *
 * Uses stale-while-revalidate: stale cache entries are returned immediately
 * while a background fetch updates the cache.
 *
 * @example
 * ```tsx
 * const showNewUI = useRemoteConfig("feature_new_ui", false);
 * const variant = useRemoteConfig<string>("onboarding_variant", "control");
 * ```
 */
import { useEffect, useRef, useState } from "react";

import { useCanopyContext } from "../context/CanopyProvider";
import { readCache, writeCache, isStale } from "../config/cache";
import { fetchRemoteConfig } from "../config/fetch";

export function useRemoteConfig<T>(key: string, defaultValue: T): T {
    const ctx = useCanopyContext();
    const [value, setValue] = useState<T>(defaultValue);
    const fetchingRef = useRef(false);

    useEffect(() => {
        let mounted = true;

        async function resolve(): Promise<void> {
            try {
                const appId = ctx.config.appId;

                // 1. Try cache first
                const cached = await readCache(appId);
                if (cached) {
                    const cachedValue = cached.values[key];
                    if (cachedValue !== undefined && mounted) {
                        setValue(cachedValue as T);
                    }

                    // If fresh, no need to fetch
                    if (!isStale(cached)) return;
                }

                // 2. Fetch from server (background if cache hit, blocking if no cache)
                if (fetchingRef.current) return;
                fetchingRef.current = true;

                const context = {
                    walletHash: ctx.walletHash,
                    appVersion: ctx.config.appVersion ?? null,
                };

                const fresh = await fetchRemoteConfig(ctx.config, context);
                fetchingRef.current = false;

                if (!mounted || !fresh) return;

                // Write fresh values to cache
                await writeCache(appId, fresh);

                const freshValue = fresh[key];
                if (freshValue !== undefined) {
                    setValue(freshValue as T);
                }
            } catch {
                // Never crash the host app — silently fall back to defaultValue
            }
        }

        void resolve();

        return (): void => {
            mounted = false;
        };
    }, [ctx.config, ctx.walletHash, key, defaultValue]);

    return value;
}
