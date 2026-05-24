import * as core from "@actions/core";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

interface TrackResponse {
    data: {
        id: string;
        expires_at: string;
        tester_cap: number;
        status: string;
        version_name: string;
        version_code: number;
    };
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

        // Guard: 200 MB hard limit (same as CLI)
        if (apkSizeMb > 200) {
            core.setFailed(
                `APK exceeds the 200 MB size limit (${apkSizeMb.toFixed(1)} MB): ${basename(apkPath)}`
            );
            return;
        }

        core.info(`Uploading ${basename(apkPath)} (${apkSizeMb.toFixed(1)} MB) to Canopy…`);

        // Read APK into a Buffer via streaming.
        const buffer = await readFileBuffer(apkPath);
        const blob = new Blob([buffer], {
            type: "application/vnd.android.package-archive",
        });

        const form = new FormData();
        form.append("apk", blob, basename(apkPath));
        form.append("appId", appId);
        form.append("versionName", versionName);
        form.append("versionCode", String(versionCode));
        form.append("expiresInDays", String(expiresIn));

        if (releaseNotes.trim().length > 0) {
            if (releaseNotes.length > 2000) {
                core.setFailed(
                    `release-notes exceeds the 2000 character limit (${String(releaseNotes.length)} chars)`
                );
                return;
            }
            form.append("releaseNotes", releaseNotes);
        }

        // POST to the Canopy API.
        const apiUrl = process.env["CANOPY_API_URL"] ?? "https://canopy.dev/api/v1";
        const endpoint = `${apiUrl}/beta/upload`;

        core.debug(`POST ${endpoint}`);

        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                // Do not set Content-Type — let fetch set the multipart boundary automatically.
            },
            body: form,
        });

        if (!res.ok) {
            let errorMessage: string;
            const contentType = res.headers.get("content-type") ?? "";

            if (contentType.includes("application/json")) {
                const body = (await res.json()) as {
                    error?: { code?: string; message?: string };
                };
                errorMessage = body.error?.message ?? `HTTP ${String(res.status)}`;
                const errorCode = body.error?.code;
                if (errorCode) {
                    errorMessage = `[${errorCode}] ${errorMessage}`;
                }
            } else {
                errorMessage = await res.text();
            }

            core.setFailed(`Canopy API error ${String(res.status)}: ${errorMessage}`);
            return;
        }

        const { data } = (await res.json()) as TrackResponse;

        core.setOutput("track-id", data.id);
        core.setOutput("expires-at", data.expires_at);
        core.setOutput("tester-cap", String(data.tester_cap));

        const expiresAt = new Date(data.expires_at);

        core.info("──────────────────────────────────────");
        core.info("  Canopy Beta Track Created");
        core.info("──────────────────────────────────────");
        core.info(`  Track ID   : ${data.id}`);
        core.info(`  Version    : ${data.version_name} (${String(data.version_code)})`);
        core.info(`  Status     : ${data.status}`);
        core.info(`  Tester cap : ${String(data.tester_cap)}`); core.info(`  Expires    : ${expiresAt.toUTCString()}`);
        core.info("──────────────────────────────────────");

        if (data.status === "pending_scan") {
            core.notice(
                "Beta track is pending malware scan. It will activate automatically once the scan passes.",
                { title: "Canopy: Scan Pending" }
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
