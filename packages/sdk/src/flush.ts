/**
 * Flush the event queue to the Canopy ingest service.
 *
 * Events are sent in batches of up to FLUSH_BATCH_SIZE.
 * If a batch fails, the error propagates to the caller (CanopyProvider
 * will re-queue the failed events).
 */
import type { CanopyEvent, FlushPayload, CanopyConfig } from "@canopy/types";

const FLUSH_BATCH_SIZE = 50;
const DEFAULT_INGEST_URL = "https://ingest.trycanopy.xyz";

/**
 * POST all events to the ingest service in batches.
 * Throws on network error — caller is responsible for retry/re-queue logic.
 */
export async function flushEvents(
    events: CanopyEvent[],
    config: CanopyConfig,
): Promise<void> {
    if (events.length === 0) return;

    const ingestUrl = config.ingestUrl ?? DEFAULT_INGEST_URL;

    for (let i = 0; i < events.length; i += FLUSH_BATCH_SIZE) {
        const batch = events.slice(i, i + FLUSH_BATCH_SIZE);
        const payload: FlushPayload = {
            apiKey: config.apiKey,
            appId: config.appId,
            events: batch,
        };

        const response = await fetch(`${ingestUrl}/v1/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            // 429 (rate limited) and 5xx / network failures are transient —
            // throw so the caller re-queues and retries. Other 4xx are client /
            // data errors (bad API key, malformed or poison batch) that will
            // NEVER succeed on retry — drop the batch to avoid an infinite retry
            // loop that loses every subsequent event behind it.
            const retryable = response.status === 429 || response.status >= 500;
            if (!retryable) {
                if (config.debug === true) {
                    console.warn(
                        "[Canopy] Dropping batch — ingest returned HTTP " + String(response.status),
                    );
                }
                continue;
            }
            throw new Error("Canopy ingest returned HTTP " + String(response.status));
        }
    }
}
