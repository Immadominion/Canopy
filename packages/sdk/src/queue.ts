/**
 * AsyncStorage-backed event queue.
 *
 * All errors are caught silently — the SDK must not crash the host app.
 * Events survive app kills and are re-loaded on next mount.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CanopyEvent } from "@canopy/types";

const QUEUE_KEY = "@canopy/event_queue";

/** Load any persisted events from a prior session. */
export async function loadQueue(): Promise<CanopyEvent[]> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as CanopyEvent[];
    } catch {
        return [];
    }
}

/** Persist the current in-memory queue to AsyncStorage (fire-and-forget). */
export async function persistQueue(events: CanopyEvent[]): Promise<void> {
    try {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(events));
    } catch {
        // Silently discard — queue will be rebuilt from memory
    }
}

/** Clear the persisted queue after a successful flush. */
export async function clearQueue(): Promise<void> {
    try {
        await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
        // Silently discard
    }
}
