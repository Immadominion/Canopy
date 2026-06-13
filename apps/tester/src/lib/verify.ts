/**
 * The trusted-install pipeline for one beta — this is the deepfake gate.
 *
 *   1. initiate  → wallet-bound signed download URL
 *   2. download  → APK to the app cache
 *   3. verify    → SHA-256(file) === the build's published fingerprint
 *   4. install   → Android PackageInstaller (only if the hash matches)
 *
 * The install is aborted before step 4 if the hash does not match, so a tampered
 * or substituted APK is never handed to the OS.
 */
import * as FileSystem from "expo-file-system";

import { initiateInstall, type BetaSummary } from "./api";
import { installer } from "../native/installer";

export type InstallStep =
    | "preparing"
    | "downloading"
    | "verifying"
    | "installing"
    | "done"
    | "error";

export interface VerifyInstallResult {
    ok: boolean;
    step: InstallStep;
    errorCode?: string;
    /** Raw native EXTRA_STATUS_MESSAGE from Android, for debugging. */
    errorDetail?: string;
    /** Actionable, human-readable guidance for the user. */
    hint?: string;
}

/**
 * Map Android's raw install-failure message to a stable code + human hint.
 * The most common real-world failure is a signature/key mismatch when updating
 * over a copy that wasn't installed by Canopy — Android rejects the update and
 * the only fix is to uninstall the old copy first.
 */
function classifyInstallFailure(message?: string | null): { code: string; hint?: string } {
    const m = (message ?? "").toUpperCase();
    if (
        m.includes("UPDATE_INCOMPATIBLE") ||
        m.includes("SIGNATURES DO NOT MATCH") ||
        m.includes("INCONSISTENT_CERTIFICATES") ||
        m.includes("SHARED_USER_INCOMPATIBLE")
    ) {
        return {
            code: "SIGNATURE_MISMATCH",
            hint:
                "The copy already on your device was signed with a different key, so Android " +
                "won't replace it. Remove the old copy, then install this build.",
        };
    }
    if (m.includes("VERSION_DOWNGRADE")) {
        return {
            code: "VERSION_DOWNGRADE",
            hint: "A newer build is already installed. Remove it first to install this one.",
        };
    }
    if (m.includes("INSUFFICIENT_STORAGE")) {
        return { code: "INSUFFICIENT_STORAGE", hint: "Not enough free space on your device." };
    }
    return { code: "INSTALL_FAILED" };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Download the APK with bounded retries on transient failures (network blips,
 * 5xx). A 4xx (expired / forbidden ticket) is not retried — it won't recover.
 * Each attempt re-downloads from scratch; correctness is guaranteed by the
 * SHA-256 verification that follows, so a partial/garbled retry can't slip through.
 */
async function downloadApk(
    url: string,
    target: string,
    onProgress?: (pct: number) => void,
    attempts = 3,
): Promise<FileSystem.FileSystemDownloadResult | { httpStatus: number }> {
    let lastStatus = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const resumable = FileSystem.createDownloadResumable(url, target, {}, (p) => {
                if (p.totalBytesExpectedToWrite > 0) {
                    onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
                }
            });
            const dl = await resumable.downloadAsync();
            if (dl?.status === 200) return dl;
            lastStatus = dl?.status ?? 0;
            if (lastStatus >= 400 && lastStatus < 500) break; // not retryable
        } catch {
            // Network error — fall through to backoff + retry.
        }
        if (attempt < attempts - 1) await sleep(500 * 2 ** attempt);
    }
    return { httpStatus: lastStatus };
}

export async function downloadVerifyInstall(
    beta: BetaSummary,
    onStep?: (step: InstallStep) => void,
    onProgress?: (pct: number) => void,
): Promise<VerifyInstallResult> {
    // Only active betas carry an installable fingerprint; revoked/expired don't.
    if (!beta.apkSha256) {
        return { ok: false, step: "error", errorCode: "NOT_INSTALLABLE" };
    }
    const fingerprint = beta.apkSha256.toLowerCase();

    try {
        onStep?.("preparing");
        const ticket = await initiateInstall(beta.trackId);

        onStep?.("downloading");
        const target = `${FileSystem.cacheDirectory ?? ""}${fingerprint}.apk`;
        const dl = await downloadApk(ticket.url, target, onProgress);
        if (!("uri" in dl)) {
            return { ok: false, step: "downloading", errorCode: `HTTP_${String(dl.httpStatus)}` };
        }

        onStep?.("verifying");
        if (!installer.isAvailable()) {
            // Without the native module we can neither hash nor install on-device
            // (Phase 2). Never fall back to an unverified install.
            return { ok: false, step: "verifying", errorCode: "INSTALLER_UNAVAILABLE" };
        }
        const actual = (await installer.sha256OfFile(dl.uri)).toLowerCase();
        if (actual !== fingerprint) {
            await FileSystem.deleteAsync(dl.uri, { idempotent: true });
            return { ok: false, step: "verifying", errorCode: "HASH_MISMATCH" };
        }

        onStep?.("installing");
        const result = await installer.installApk(dl.uri);
        if (result.status !== "installed") {
            if (result.status === "user_cancelled") {
                return { ok: false, step: "installing", errorCode: "USER_CANCELLED" };
            }
            // Surface the REAL Android reason instead of a generic "FAILED".
            const { code, hint } = classifyInstallFailure(result.message);
            return {
                ok: false,
                step: "installing",
                errorCode: code,
                errorDetail: result.message ?? undefined,
                hint,
            };
        }

        onStep?.("done");
        return { ok: true, step: "done" };
    } catch (err) {
        return {
            ok: false,
            step: "error",
            errorCode: err instanceof Error ? err.message : "INSTALL_FAILED",
        };
    }
}
