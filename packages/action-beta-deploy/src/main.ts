import * as core from "@actions/core";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

interface InitiateResponse {
    uploadUrl: string;
    uploadKey: string;
}

interface FinalizeResponse {
    trackId: string;
    status: string;
    expiresAt: string;
    apkSha256: string;
    apkSizeBytes: number;
    versionName: string;
    versionCode: number;
}

/** Extract a human-readable error from a non-OK Canopy API response. */
async function apiErrorMessage(res: Response): Promise<string> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        const body = (await res.json().catch(() => ({}))) as {
            error?: { code?: string; message?: string };
        };
        const msg = body.error?.message ?? `HTTP ${String(res.status)}`;
        return body.error?.code ? `[${body.error.code}] ${msg}` : msg;
    }
    return res.text().catch(() => `HTTP ${String(res.status)}`);
}

async function run(): Promise<void> {
    try {
        const apiKey = core.getInput("api-key", { required: true });
        const appId = core.getInput("app-id", { required: true });
        const apkPathInput = core.getInput("apk-path", { required: true });
        const versionName = core.getInput("version-name", { required: true });
        const versionCodeStr = core.getInput("version-code", { required: true });
        const expiresInStr = core.getInput("expires-in") || "30";
        const releaseNotes = core.getInput("release-notes");

        // Mask the API key immediately so it never appears in logs.
        core.setSecret(apiKey);

        // Validate version code is a positive integer.
        const versionCode = parseInt(versionCodeStr, 10);
        if (!Number.isInteger(versionCode) || versionCode <= 0) {
            core.setFailed(`version-code must be a positive integer, got: ${versionCodeStr}`);
            return;
        }

        // Validate expires-in is in range 1–30.
        const expiresIn = parseInt(expiresInStr, 10);
        if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 30) {
            core.setFailed(`expires-in must be an integer between 1 and 30, got: ${expiresInStr}`);
            return;
        }

        if (releaseNotes.length > 2000) {
            core.setFailed(
                `release-notes exceeds the 2000 character limit (${String(releaseNotes.length)} chars)`,
            );
            return;
        }

        // Resolve APK path relative to the workspace.
        const apkPath = resolve(process.env["GITHUB_WORKSPACE"] ?? process.cwd(), apkPathInput);

        if (!existsSync(apkPath)) {
            core.setFailed(`APK file not found: ${apkPath}`);
            return;
        }
        if (!apkPath.endsWith(".apk")) {
            core.setFailed(`apk-path must point to a .apk file, got: ${basename(apkPath)}`);
            return;
        }

        const apkStat = statSync(apkPath);
        const apkSizeMb = apkStat.size / 1024 / 1024;

        // Guard: 200 MB hard limit (same as CLI / API).
        if (apkSizeMb > 200) {
            core.setFailed(
                `APK exceeds the 200 MB size limit (${apkSizeMb.toFixed(1)} MB): ${basename(apkPath)}`,
            );
            return;
        }

        core.info(`Uploading ${basename(apkPath)} (${apkSizeMb.toFixed(1)} MB) to Canopy…`);

        const buffer = await readFileBuffer(apkPath);
        const apiUrl = process.env["CANOPY_API_URL"] ?? "https://www.trycanopy.xyz/api/v1";
        const authJson = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };

        // 1) Initiate — presigned direct-to-R2 URL (bypasses the serverless
        //    request-body limit; the old multipart POST 413'd on real APKs).
        core.debug(`POST ${apiUrl}/beta/upload/initiate`);
        const initRes = await fetch(`${apiUrl}/beta/upload/initiate`, {
            method: "POST",
            headers: authJson,
            body: JSON.stringify({ appId, size: apkStat.size }),
        });
        if (!initRes.ok) {
            core.setFailed(`Canopy API error ${String(initRes.status)}: ${await apiErrorMessage(initRes)}`);
            return;
        }
        const init = (await initRes.json()) as InitiateResponse;

        // 2) PUT the APK straight to R2.
        const putRes = await fetch(init.uploadUrl, { method: "PUT", body: buffer });
        if (!putRes.ok) {
            core.setFailed(`Upload to storage failed (HTTP ${String(putRes.status)})`);
            return;
        }

        // 3) Finalize — the server validates the object and creates the track.
        core.debug(`POST ${apiUrl}/beta/upload/finalize`);
        const finRes = await fetch(`${apiUrl}/beta/upload/finalize`, {
            method: "POST",
            headers: authJson,
            body: JSON.stringify({
                appId,
                uploadKey: init.uploadKey,
                versionName,
                versionCode,
                expiresInDays: expiresIn,
                ...(releaseNotes.trim().length > 0 ? { releaseNotes } : {}),
            }),
        });
        if (!finRes.ok) {
            core.setFailed(`Canopy API error ${String(finRes.status)}: ${await apiErrorMessage(finRes)}`);
            return;
        }
        const data = (await finRes.json()) as FinalizeResponse;

        core.setOutput("track-id", data.trackId);
        core.setOutput("expires-at", data.expiresAt);
        core.setOutput("tester-cap", "200"); // hard cap (Invariant 2)

        const expiresAt = new Date(data.expiresAt);

        core.info("──────────────────────────────────────");
        core.info("  Canopy Beta Track Created");
        core.info("──────────────────────────────────────");
        core.info(`  Track ID   : ${data.trackId}`);
        core.info(`  Version    : ${data.versionName} (${String(data.versionCode)})`);
        core.info(`  Status     : ${data.status}`);
        core.info(`  Expires    : ${expiresAt.toUTCString()}`);
        core.info("──────────────────────────────────────");

        if (data.status === "pending_scan") {
            core.notice(
                "Beta track is pending malware scan. It will activate automatically once the scan passes.",
                { title: "Canopy: Scan Pending" },
            );
        }
    } catch (err) {
        if (err instanceof Error) {
            core.setFailed(err.message);
        } else {
            core.setFailed("An unexpected error occurred in canopy/action-beta-deploy");
        }
    }
}

function readFileBuffer(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = createReadStream(filePath);

        stream.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        stream.on("end", () => {
            resolve(Buffer.concat(chunks));
        });

        stream.on("error", (err) => {
            reject(err);
        });
    });
}

void run();
