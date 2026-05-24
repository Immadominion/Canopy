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
 */
export class RateLimiter {
    private count = 0;
    private windowStart = Date.now();
    private readonly windowMs = 60_000; // 1 minute
    private readonly limit = 1000; // requests per window

    fetch(_request: Request): Response {
        const now = Date.now();

        // Reset window if expired
        if (now - this.windowStart > this.windowMs) {
            this.count = 0;
            this.windowStart = now;
        }

        this.count++;
        const allowed = this.count <= this.limit;

        return Response.json({ allowed, count: this.count, limit: this.limit });
    }
}
