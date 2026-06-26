/**
 * Partitions a batch into events we have NOT seen before (`accepted`) and
 * duplicates we have (`rejected`), keyed by the client-generated event UUID
 * stored in KV with a 24h TTL.
 *
 * Generic over the event shape (only `id` is read here), so it works with the
 * Zod-validated batch type directly without coupling to a stricter struct.
 *
 * This only READS the dedup markers. Markers are written by `markEventsSeen()`
 * AFTER a successful DB write — never here, pre-write. Writing them before the
 * write would permanently drop events on any transient DB failure: the SDK
 * retries the same batch, the markers now say "seen", every event moves to
 * `rejected`, and the data is lost forever.
 */
export async function dedupEvents<T extends { id: string }>(
    events: T[],
    dedupKv: KVNamespace,
): Promise<{ accepted: T[]; rejected: string[] }> {
    const accepted: T[] = [];
    const rejected: string[] = [];

    const lookups = await Promise.all(
        events.map(async (event) => {
            try {
                const existing = await dedupKv.get(`event:${event.id}`);
                return { event, isDuplicate: existing !== null };
            } catch {
                // KV read failed — we can't tell, so DON'T drop the event. Treat
                // it as new; the DB's ON CONFLICT DO NOTHING is the final guard.
                return { event, isDuplicate: false };
            }
        }),
    );

    for (const { event, isDuplicate } of lookups) {
        if (isDuplicate) {
            rejected.push(event.id);
        } else {
            accepted.push(event);
        }
    }

    return { accepted, rejected };
}

/**
 * Marks events as seen (24h TTL) so future retries are deduped. Call this ONLY
 * after the events are durably written, and prefer `executionCtx.waitUntil()` so
 * the KV writes survive the response returning.
 */
export async function markEventsSeen(
    events: { id: string }[],
    dedupKv: KVNamespace,
): Promise<void> {
    await Promise.allSettled(
        events.map((event) => dedupKv.put(`event:${event.id}`, "1", { expirationTtl: 86400 })),
    );
}
