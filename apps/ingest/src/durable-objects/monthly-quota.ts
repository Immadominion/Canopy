/**
 * Monthly events quota, one Durable Object instance per publisher.
 *
 * Counts accepted events for the current calendar month (UTC) and blocks once
 * the plan's limit is reached. A small grace buffer means a publisher is never
 * cut off exactly at the line during a spike; they get a little headroom, then a
 * clear 429 telling them to upgrade. The count resets when the month rolls over.
 *
 * State is persisted to DO storage (not instance fields) because a DO is evicted
 * after idle / on deploy, which would otherwise reset the counter mid-month.
 */

interface QuotaState {
    month: string; // "YYYY-MM" (UTC)
    used: number;
}

const GRACE = 1.1; // allow 10% over the limit before hard-blocking

export class MonthlyQuota {
    constructor(private readonly state: DurableObjectState) {}

    async fetch(request: Request): Promise<Response> {
        const { count, limit } = await request.json<{ count: number; limit: number }>();
        const month = new Date().toISOString().slice(0, 7);

        const stored = await this.state.storage.get<QuotaState>("quota");
        let used = stored && stored.month === month ? stored.used : 0;

        // Unlimited plan — just keep counting, never block.
        if (limit < 0) {
            used += count;
            await this.state.storage.put<QuotaState>("quota", { month, used });
            return Response.json({ allowed: true, used, limit });
        }

        if (used >= Math.floor(limit * GRACE)) {
            return Response.json({ allowed: false, used, limit });
        }

        used += count;
        await this.state.storage.put<QuotaState>("quota", { month, used });
        return Response.json({ allowed: true, used, limit });
    }
}

/** Increment a publisher's monthly count by `count` and report if it's allowed. */
export async function checkQuota(
    publisherId: string,
    count: number,
    limit: number,
    ns: DurableObjectNamespace,
): Promise<boolean> {
    const stub = ns.get(ns.idFromName(`quota:${publisherId}`));
    const resp = await stub.fetch("https://quota/check", {
        method: "POST",
        body: JSON.stringify({ count, limit }),
    });
    const { allowed } = await resp.json<{ allowed: boolean }>();
    return allowed;
}
