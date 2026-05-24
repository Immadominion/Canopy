/** UUID v4 regex check */
export function isValidUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generates the expiry date for a new beta track.
 * Clamped to 30 days — Invariant 3.
 */
export function generateTrackExpiry(fromDate = new Date(), daysRequested = 30): Date {
    const days = Math.min(daysRequested, 30);
    const expiryMs = fromDate.getTime() + days * 24 * 60 * 60 * 1000;
    const maxMs = fromDate.getTime() + MAX_EXPIRY_MS;
    return new Date(Math.min(expiryMs, maxMs));
}
