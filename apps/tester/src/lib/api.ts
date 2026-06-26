/**
 * Canopy web API client (authenticated). Thin wrappers over authedFetch.
 */
import { authedFetch } from "./session";

/** Tester-facing lifecycle state of a track. */
export type BetaStatus = "active" | "revoked" | "expired";

export interface BetaSummary {
    trackId: string;
    appName: string;
    packageName: string | null;
    versionName: string;
    versionCode: number;
    /** Lifecycle state — only "active" betas are installable. */
    status: BetaStatus;
    /**
     * SHA-256 hex of the APK — the fingerprint verified before install.
     * null for revoked/expired tracks (no installable binary).
     */
    apkSha256: string | null;
    apkSizeBytes: number | null;
    releaseNotes: string | null;
    expiresAt: string;
}

/** The wallet's installable betas (active, non-expired, allowlisted). */
export async function listMyBetas(): Promise<BetaSummary[]> {
    const res = await authedFetch("/api/v1/beta/mine");
    if (!res.ok) throw new Error("BETAS_FETCH_FAILED");
    const data = (await res.json()) as { betas: BetaSummary[] };
    return data.betas;
}

export interface InstallTicket {
    /** Wallet-bound, single-use, short-lived signed download URL. */
    url: string;
    expiresAt: string;
}

/** Request a signed download URL for a track the wallet is allowed to install. */
export async function initiateInstall(trackId: string): Promise<InstallTicket> {
    const res = await authedFetch("/api/v1/beta/install/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
    });
    if (!res.ok) {
        throw new Error(res.status === 404 ? "NOT_ALLOWED" : "INITIATE_FAILED");
    }
    return (await res.json()) as InstallTicket;
}

/**
 * Report a successful on-device install (best-effort). Lets the publisher see
 * who actually installed (the roster's Installed state). Never throws — the
 * install has already succeeded by the time this is called.
 */
export async function confirmInstall(trackId: string): Promise<void> {
    try {
        await authedFetch("/api/v1/beta/install/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackId }),
        });
    } catch {
        // Non-fatal.
    }
}
