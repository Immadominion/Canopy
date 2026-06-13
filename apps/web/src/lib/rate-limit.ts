/**
 * Best-effort in-memory fixed-window rate limiter.
 *
 * Single-instance only — counters live in process memory, so under multiple
 * serverless instances each enforces its own window. That makes this a useful
 * abuse *speed bump* (e.g. capping access-request / founder-notification spam),
 * NOT a hard guarantee. For strict, distributed limits back this with Redis /
 * Upstash or the ingest service's Durable-Object limiter.
 */

interface Bucket {
    count: number;
    resetAt: number; // epoch ms
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number): void {
    for (const [key, b] of buckets) {
        if (now >= b.resetAt) buckets.delete(key);
    }
}

export interface RateLimitResult {
    allowed: boolean;
    retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || now >= existing.resetAt) {
        if (buckets.size > MAX_TRACKED_KEYS) sweep(now);
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
    }

    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

/** Extract the best-guess client IP from forwarding headers. */
export function clientIp(request: Request): string {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) return first;
    }
    return request.headers.get("x-real-ip") ?? "unknown";
}
