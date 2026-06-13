import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Herald — privacy-preserving developer notifications.
 *
 * Canopy notifies a developer by their WALLET address (which we already have
 * from SIWS). Herald resolves the wallet to the developer's own client-side-
 * encrypted contact and delivers email/Telegram/SMS — Canopy never sees or
 * stores their email/phone, and the developer controls opt-in (they register
 * once at notify.useherald.xyz). If a dev hasn't registered / opted into the
 * category, Herald returns `opted_out` and delivers nothing.
 *
 * Best-effort: no-ops when unconfigured, never throws.
 */

const log = logger.child({ module: "herald" });

export type HeraldCategory = "defi" | "governance" | "system" | "marketing" | "security";

export interface NotifyResult {
    /** True when Herald accepted it for delivery (the dev is registered + opted in). */
    delivered: boolean;
    status: string;
}

export function heraldEnabled(): boolean {
    return Boolean(env.HERALD_API_KEY);
}

export async function notifyDeveloper(opts: {
    /** Developer's base58 wallet address (the one they sign into Canopy with). */
    wallet: string;
    subject: string;
    body: string;
    /** Drives the dev's opt-in filtering. Build/operational alerts = "system". */
    category?: HeraldCategory;
    /** Deterministic key so retries never double-send. */
    idempotencyKey?: string;
}): Promise<NotifyResult> {
    if (!env.HERALD_API_KEY) return { delivered: false, status: "disabled" };

    try {
        const res = await fetch(`${env.HERALD_BASE_URL}/v1/notify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.HERALD_API_KEY}`,
            },
            body: JSON.stringify({
                wallet: opts.wallet,
                subject: opts.subject,
                body: opts.body,
                category: opts.category ?? "system",
                priority: "normal",
                ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
            }),
        });

        if (!res.ok) {
            log.warn({ status: res.status }, "Herald notify returned non-200");
            return { delivered: false, status: `http_${res.status}` };
        }

        const data = (await res.json().catch(() => ({}))) as { status?: string };
        const status = data.status ?? "unknown";
        // queued / duplicate = accepted; opted_out = dev not registered (expected, not an error).
        return { delivered: status === "queued" || status === "duplicate", status };
    } catch (err) {
        log.warn({ err }, "Herald notify failed");
        return { delivered: false, status: "error" };
    }
}
