import type { NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";

/** Milliseconds in a day — handy for building `defaultSinceMs`. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse an ISO date param: returns the normalized ISO string, the fallback when
 * absent, or `null` when present-but-unparseable (caller turns that into a 400).
 *
 * Replaces the `new Date(raw).toISOString()` pattern that threw RangeError
 * ("Invalid time value") on garbage input and surfaced as an opaque 500.
 */
function parseOneDate(raw: string | null, fallbackMs: number): string | null {
    if (raw === null || raw === "") return new Date(fallbackMs).toISOString();
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) return null;
    return new Date(ms).toISOString();
}

/** Parse a single `?since=` param. Returns an ISO string, or a 400 response. */
export function parseSince(
    request: NextRequest,
    defaultSinceMs: number,
): string | NextResponse {
    const since = parseOneDate(request.nextUrl.searchParams.get("since"), defaultSinceMs);
    if (since === null) return apiError("INVALID_PARAM", "`since` is not a valid date", 400);
    return since;
}

/**
 * Parse `?since=` / `?until=` into a normalized window. Enforces `since <= until`
 * (an inverted range previously returned a silent, valid-looking empty 200).
 * Returns the window, or a 400 response.
 */
export function parseDateRange(
    request: NextRequest,
    opts: { defaultSinceMs: number; nowMs?: number },
): { since: string; until: string } | NextResponse {
    const nowMs = opts.nowMs ?? Date.now();
    const since = parseOneDate(request.nextUrl.searchParams.get("since"), opts.defaultSinceMs);
    if (since === null) return apiError("INVALID_PARAM", "`since` is not a valid date", 400);
    const until = parseOneDate(request.nextUrl.searchParams.get("until"), nowMs);
    if (until === null) return apiError("INVALID_PARAM", "`until` is not a valid date", 400);
    if (Date.parse(since) > Date.parse(until)) {
        return apiError("INVALID_RANGE", "`since` must be on or before `until`", 400);
    }
    return { since, until };
}

/**
 * Parse a bounded integer param (e.g. `limit`, `maxDays`). Clamps into
 * `[min, max]`; non-numeric or absent → `fallback`. Prevents NaN reaching the
 * query layer and negative/zero values producing garbage.
 */
export function parseBoundedInt(
    raw: string | null,
    opts: { fallback: number; min: number; max: number },
): number {
    if (raw === null || raw === "") return opts.fallback;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return opts.fallback;
    return Math.min(Math.max(n, opts.min), opts.max);
}
