/**
 * Remote Config fetch — calls GET /api/v1/remote-config and returns resolved
 * key/value pairs. Evaluates conditions server-side.
 *
 * Never throws — returns null on any error.
 */
import type { CanopyConfig } from "@canopy/types";

export interface RemoteConfigContext {
    walletHash?: string | null;
    appVersion?: string | null;
    isSeeker?: boolean | null;
    skrTier?: string | null;
}

export async function fetchRemoteConfig(
    config: CanopyConfig,
    context: RemoteConfigContext,
): Promise<Record<string, unknown> | null> {
    try {
        const url = new URL(`${config.ingestUrl ?? ""}/api/v1/remote-config`);
        url.searchParams.set("appId", config.appId);
        if (context.walletHash) url.searchParams.set("walletHash", context.walletHash);
        if (context.appVersion) url.searchParams.set("appVersion", context.appVersion);
        if (context.isSeeker === true) url.searchParams.set("isSeeker", "true");
        if (context.skrTier) url.searchParams.set("skrTier", context.skrTier);

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                Accept: "application/json",
            },
        });

        if (!res.ok) return null;

        const body = await res.json() as { config?: Record<string, unknown> };
        return body.config ?? null;
    } catch {
        return null;
    }
}
