/**
 * Session storage for the Canopy tester app.
 *
 * The SIWS handshake (see siws.ts) exchanges a wallet signature for a Supabase
 * session, whose tokens we persist in the device keystore via expo-secure-store.
 * `authedFetch` attaches the access token as a Bearer header — the web API's
 * getSessionWallet() accepts it (see apps/web/src/lib/auth/session.ts).
 *
 * Token refresh: when the access token is expired (or a request 401s) we
 * exchange the stored refresh token for a fresh one via /api/v1/auth/refresh,
 * so a tester isn't bounced to the connect screen on every expiry. Only if the
 * refresh itself fails do we clear the session and route back to connect.
 */
import * as SecureStore from "expo-secure-store";

import { API_BASE_URL } from "./config";

const SESSION_KEY = "canopy.session.v1";

/** Refresh this many seconds *before* the token's actual expiry. */
const REFRESH_SKEW_SECONDS = 60;

/** Statuses worth retrying — transient gateway / network failures only. */
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export interface StoredSession {
    accessToken: string;
    refreshToken: string;
    /** Unix seconds, or null if unknown. */
    expiresAt: number | null;
    /** Base58 wallet address that authenticated. */
    walletAddress: string;
}

export async function saveSession(session: StoredSession): Promise<void> {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<StoredSession | null> {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as StoredSession;
    } catch {
        return null;
    }
}

export async function clearSession(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEY);
}

/** Raised by authedFetch when there is no session or the server rejects it. */
export class UnauthenticatedError extends Error {
    constructor() {
        super("UNAUTHENTICATED");
        this.name = "UnauthenticatedError";
    }
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * fetch with bounded retries on transient failures (network errors and
 * 502/503/504). Backs off with jitter. 4xx (incl. 401) is returned as-is for
 * the caller to handle — auth failures must not be silently retried.
 */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const res = await fetch(url, init);
            if (RETRYABLE_STATUS.has(res.status) && attempt < attempts - 1) {
                await sleep(backoffMs(attempt));
                continue;
            }
            return res;
        } catch (err) {
            lastError = err;
            if (attempt < attempts - 1) {
                await sleep(backoffMs(attempt));
                continue;
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error("NETWORK_ERROR");
}

function backoffMs(attempt: number): number {
    // 400ms, 800ms, 1600ms … plus up to 200ms jitter to de-sync retries.
    return 400 * 2 ** attempt + Math.floor(Math.random() * 200);
}

/**
 * In-flight refresh, shared across callers. Supabase rotates refresh tokens
 * (each is single-use), so two concurrent refreshes with the same token would
 * make the second fail — every caller must await the same exchange.
 */
let refreshInFlight: Promise<StoredSession | null> | null = null;

function refreshSession(current: StoredSession): Promise<StoredSession | null> {
    refreshInFlight ??= (async () => {
        try {
            const res = await fetchWithRetry(`${API_BASE_URL}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: current.refreshToken }),
            });
            if (!res.ok) return null;
            const data = (await res.json()) as {
                session?: { accessToken: string; refreshToken: string; expiresAt: number | null };
            };
            if (!data.session) return null;
            const next: StoredSession = { ...data.session, walletAddress: current.walletAddress };
            await saveSession(next);
            return next;
        } catch {
            return null;
        } finally {
            refreshInFlight = null;
        }
    })();
    return refreshInFlight;
}

async function fetchWithToken(path: string, init: RequestInit | undefined, token: string): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetchWithRetry(`${API_BASE_URL}${path}`, { ...init, headers });
}

/**
 * fetch() against the Canopy web API with the stored Bearer token attached.
 * `path` is relative to API_BASE_URL (e.g. "/api/v1/beta/mine").
 *
 * Refreshes the token proactively when it's near expiry and reactively on a
 * 401 (retrying the request once with the new token). Throws
 * UnauthenticatedError — after clearing the session — only when there is no
 * session or the refresh itself fails.
 */
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    let session = await loadSession();
    if (!session) throw new UnauthenticatedError();

    // Proactive: refresh before the request if the token has (nearly) expired.
    if (session.expiresAt != null && session.expiresAt - REFRESH_SKEW_SECONDS <= nowSeconds()) {
        const refreshed = await refreshSession(session);
        if (refreshed) session = refreshed;
    }

    let res = await fetchWithToken(path, init, session.accessToken);
    if (res.status !== 401) return res;

    // Reactive: token rejected — try one refresh + retry before giving up.
    const refreshed = await refreshSession(session);
    if (!refreshed) {
        await clearSession();
        throw new UnauthenticatedError();
    }
    res = await fetchWithToken(path, init, refreshed.accessToken);
    if (res.status === 401) {
        await clearSession();
        throw new UnauthenticatedError();
    }
    return res;
}

/**
 * Returns a valid Bearer access token, refreshing proactively when it is near
 * expiry. For requests that can't go through authedFetch — specifically the APK
 * download, which streams via expo-file-system but must still prove the wallet's
 * session to the wallet-bound download endpoint (apps/web .../beta/download).
 * Throws UnauthenticatedError when there is no session.
 */
export async function getValidAccessToken(): Promise<string> {
    let session = await loadSession();
    if (!session) throw new UnauthenticatedError();

    if (session.expiresAt != null && session.expiresAt - REFRESH_SKEW_SECONDS <= nowSeconds()) {
        const refreshed = await refreshSession(session);
        if (refreshed) session = refreshed;
    }

    return session.accessToken;
}
