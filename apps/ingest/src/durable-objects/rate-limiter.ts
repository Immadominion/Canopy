/**
 * Rate limiter using Cloudflare Durable Objects.
 * One DO instance per publisher — tracks request count in memory.
 * Limit: 1000 event batches per minute per publisher.
 */
export async function checkRateLimit(
    publisherId: string,
    rateLimiterNs: DurableObjectNamespace,
): Promise<boolean> {
    const id = rateLimiterNs.idFromName(publisherId);
    const stub = rateLimiterNs.get(id);

    const response = await stub.fetch("https://dummy/check", { method: "POST" });
    const body = await response.json<{ allowed: boolean }>();
    const { allowed } = body;
    return allowed;
}

/**
 * Rate limiter Durable Object.
 * Exported from index.ts for Wrangler registration.
 *
 * State is PERSISTED to DO storage rather than held in plain instance fields:
 * a DO is evicted after ~30s idle and on every deploy, which would silently
 * reset an in-memory counter and let a publisher exceed the limit by idling
 * between bursts. DO storage reads/writes engage the input gate, so the
 * read-increment-write below is delivered atomically per request.
 */
interface RateState {
    count: number;
    windowStart: number;
}

export class RateLimiter {
    private readonly windowMs = 60_000; // 1 minute
    private readonly limit = 1000; // requests per window

    constructor(private readonly state: DurableObjectState) {}

    async fetch(_request: Request): Promise<Response> {
        const now = Date.now();
        const stored = await this.state.storage.get<RateState>("rate");

        let count = stored?.count ?? 0;
        let windowStart = stored?.windowStart ?? now;

        // Reset window if expired
        if (now - windowStart > this.windowMs) {
            count = 0;
            windowStart = now;
        }

        count++;
        const allowed = count <= this.limit;

        await this.state.storage.put<RateState>("rate", { count, windowStart });

        return Response.json({ allowed, count, limit: this.limit });
    }
}
