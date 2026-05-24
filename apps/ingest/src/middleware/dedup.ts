import type { IngestEvent } from "../types";

/**
 * Deduplicates events by their client-generated UUID.
 * Event UUIDs are stored in KV with a 24-hour TTL.
 * Duplicate events (retried by SDK) are silently dropped.
 */
export async function dedupEvents(
    events: IngestEvent[],
    dedupKv: KVNamespace,
): Promise<{ accepted: IngestEvent[]; rejected: string[] }> {
    const accepted: IngestEvent[] = [];
    const rejected: string[] = [];

    // Batch KV lookups in parallel (up to 200 events per batch)
    const lookups = await Promise.allSettled(
        events.map(async (event) => {
            const key = `event:${event.id}`;
            const existing = await dedupKv.get(key);
            return { event, isDuplicate: existing !== null };
        }),
    );

    // Process results and batch-write accepted event IDs to KV
    const kvWrites: Promise<void>[] = [];

    for (const result of lookups) {
        if (result.status === "rejected") continue;
        const { event, isDuplicate } = result.value;

        if (isDuplicate) {
            rejected.push(event.id);
        } else {
            accepted.push(event);
            // Mark as seen — 24h TTL
            kvWrites.push(
                dedupKv.put(`event:${event.id}`, "1", { expirationTtl: 86400 }),
            );
        }
    }

    // Write dedup markers (fire and forget — don't block response)
    void Promise.allSettled(kvWrites);

    return { accepted, rejected };
}
