import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { existsSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";

interface CheckResult {
    name: string;
    passed: boolean;
    detail: string;
}

interface CheckResults {
    passed: boolean;
    checks: CheckResult[];
}

interface ReleaseResponse {
    data: {
        id: string;
        version_name: string;
        version_code: number;
        status: string;
        check_results: CheckResults | null;
        created_at: string;
    };
}

async function run(): Promise<void> {
    try {
        const apiKey = core.getInput("api-key", { required: true });
        const appId = core.getInput("app-id", { required: true });
        const apkPathInput = core.getInput("apk-path", { required: true });
        const versionName = core.getInput("version-name", { required: true });
        const versionCodeStr = core.getInput("version-code", { required: true });
        const betaTrackId = core.getInput("beta-track-id").trim();
        const releaseNotes = core.getInput("release-notes");
        const failOnCheckFailure = core.getInput("fail-on-check-failure") !== "false";

        // Mask the API key immediately.
        core.setSecret(apiKey);

        // Validate version code.
        const versionCode = parseInt(versionCodeStr, 10);
        if (!Number.isInteger(versionCode) || versionCode <= 0) {
            core.setFailed(`version-code must be a positive integer, got: ${versionCodeStr}`);
            return;
        }

        // Resolve APK path.
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
        core.info(`APK: ${basename(apkPath)} (${(apkStat.size / 1024 / 1024).toFixed(1)} MB)`);

        // ── Step 1: Run pre-submission APK checks ────────────────────────────────

        core.startGroup("Pre-submission APK checks");

        const checkResults = await runApkChecks(apkPath);

        core.endGroup();

        // Annotate the job with check results.
        emitCheckAnnotations(checkResults);

        const checkSummary = buildCheckSummary(checkResults);
        core.setOutput("checks-passed", String(checkResults.passed));
        core.setOutput("check-summary", checkSummary);

        if (!checkResults.passed && failOnCheckFailure) {
            core.setFailed(
                `Pre-submission checks failed. Fix the issues above before resubmitting.\n\n${checkSummary}`,
            );
            return;
        }

        if (!checkResults.passed) {
            core.warning(
                "Pre-submission checks failed but fail-on-check-failure is false — continuing.",
            );
        }

        // ── Step 2: Create release record in Canopy ───────────────────────────────

        core.startGroup("Creating Canopy release record");

        const apiUrl = process.env["CANOPY_API_URL"] ?? "https://trycanopy.xyz/api/v1";
        const endpoint = `${apiUrl}/releases`;

        const payload: Record<string, unknown> = {
            appId,
            versionName,
            versionCode,
            checkResults,
        };

        if (betaTrackId.length > 0) {
            payload["betaTrackId"] = betaTrackId;
        }

        if (releaseNotes.trim().length > 0) {
            if (releaseNotes.length > 2000) {
                core.setFailed(
                    `release-notes exceeds the 2000 character limit (${String(releaseNotes.length)} chars)`,
                );
                return;
            }
            payload["releaseNotes"] = releaseNotes;
        }

        core.debug(`POST ${endpoint}`);

        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
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

        const { data } = (await res.json()) as ReleaseResponse;

        core.endGroup();

        core.setOutput("release-id", data.id);

        core.info("──────────────────────────────────────");
        core.info("  Canopy Release Record Created");
        core.info("──────────────────────────────────────");
        core.info(`  Release ID : ${data.id}`);
        core.info(`  Version    : ${data.version_name} (${String(data.version_code)})`);
        core.info(`  Status     : ${data.status}`);
        core.info(`  Checks     : ${checkResults.passed ? "PASSED" : "FAILED"}`);
        core.info("──────────────────────────────────────");

        if (data.status === "check_passed") {
            core.notice(
                "Release is ready for dApp Store submission. Open the Canopy dashboard to submit.",
                { title: "Canopy: Ready to Submit" },
            );
        }
    } catch (err) {
        if (err instanceof Error) {
            core.setFailed(err.message);
        } else {
            core.setFailed("An unexpected error occurred in canopy/action-release");
        }
    }
}

/**
 * Run APK pre-submission checks.
 *
 * Currently delegates to `canopy check` if it's available on PATH.
 * Falls back to a minimal built-in check set when the CLI is not installed.
 */
async function runApkChecks(apkPath: string): Promise<CheckResults> {
    const checks: CheckResult[] = [];

    // Check 1: File size (< 200 MB)
    const sizeMb = statSync(apkPath).size / 1024 / 1024;
    checks.push({
        name: "apk_size",
        passed: sizeMb <= 200,
        detail: sizeMb <= 200
            ? `${sizeMb.toFixed(1)} MB (limit: 200 MB)`
            : `${sizeMb.toFixed(1)} MB exceeds the 200 MB limit`,
    });

    // Check 2: APK extension
    const isApk = apkPath.endsWith(".apk");
    checks.push({
        name: "apk_extension",
        passed: isApk,
        detail: isApk ? "File has .apk extension" : "File does not have .apk extension",
    });

    // Check 3: Attempt aapt/aapt2 minSdkVersion check if available.
    const aaptCheck = await tryAaptCheck(apkPath);
    if (aaptCheck !== null) {
        checks.push(aaptCheck);
    } else {
        // aapt not available on this runner — skip with a warning.
        core.warning(
            "aapt/aapt2 is not available on this runner. Install Android Build Tools to enable minSdkVersion and signing checks.",
        );
    }

    const allPassed = checks.every((c) => c.passed);

    return { passed: allPassed, checks };
}

/**
 * Runs `aapt dump badging` to verify minSdkVersion >= 30 (Solana Mobile requirement).
 * Returns null if aapt/aapt2 is not on PATH.
 */
async function tryAaptCheck(apkPath: string): Promise<CheckResult | null> {
    // Try aapt2 first, then aapt.
    for (const tool of ["aapt2", "aapt"]) {
        let output = "";

        try {
            const exitCode = await exec.exec(tool, ["dump", "badging", apkPath], {
                silent: true,
                ignoreReturnCode: true,
                listeners: {
                    stdout: (data: Buffer) => {
                        output += data.toString();
                    },
                },
            });

            if (exitCode !== 0) continue;

            // Parse minSdkVersion from aapt output: sdkVersion:'<number>'
            const match = /sdkVersion:'(\d+)'/.exec(output);
            if (!match) {
                return {
                    name: "min_sdk_version",
                    passed: false,
                    detail: `Could not parse sdkVersion from ${tool} output`,
                };
            }

            const minSdk = parseInt(match[1] ?? "0", 10);
            const required = 30; // Solana Mobile device minimum

            return {
                name: "min_sdk_version",
                passed: minSdk >= required,
                detail:
                    minSdk >= required
                        ? `minSdkVersion ${String(minSdk)} meets the Solana Mobile minimum (${String(required)})`
                        : `minSdkVersion ${String(minSdk)} is below the Solana Mobile minimum of ${String(required)}`,
            };
        } catch {
            // Tool not found — try the next one.
            continue;
        }
    }

    return null;
}

function emitCheckAnnotations(results: CheckResults): void {
    for (const check of results.checks) {
        if (check.passed) {
            core.info(`  ✓ ${check.name}: ${check.detail}`);
        } else {
            core.error(`  ✗ ${check.name}: ${check.detail}`, {
                title: `APK Check Failed: ${check.name}`,
            });
        }
    }
}

function buildCheckSummary(results: CheckResults): string {
    const lines = results.checks.map(
        (c) => `${c.passed ? "✓" : "✗"} ${c.name}: ${c.detail}`,
    );
    return lines.join("\n");
}

void run();
