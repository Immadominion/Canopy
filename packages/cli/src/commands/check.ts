import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { Command } from "commander";

import { die, error, header, info, success, table, warn } from "../lib/output.js";

interface ApkManifest {
    package: string;
    versionName: string;
    versionCode: string;
    minSdkVersion?: string;
    targetSdkVersion?: string;
    label?: string;
    permissions?: string[];
}

export function registerCheckCommand(program: Command): void {
    program
        .command("check <apkPath>")
        .description(
            "inspect APK metadata and check for common issues before upload",
        )
        .action((apkPath: string) => {
            if (!existsSync(apkPath)) {
                die(`File not found: ${apkPath}`);
            }
            if (!apkPath.endsWith(".apk")) {
                die("File must have a .apk extension.");
            }

            // Try to parse with aapt2 (preferred) or aapt
            const manifest = parseManifest(apkPath);
            if (!manifest) {
                warn("aapt2/aapt not found in PATH — cannot inspect APK contents.");
                warn(
                    "Install Android SDK Build Tools and ensure aapt2 is in your PATH.",
                );
                info(
                    "Tip: `brew install --cask android-commandlinetools` on macOS, then add to PATH.",
                );
                process.exit(0);
            }

            header("APK Manifest");
            table([
                ["PACKAGE", manifest.package],
                ["VERSION NAME", manifest.versionName],
                ["VERSION CODE", manifest.versionCode],
                ["MIN SDK", manifest.minSdkVersion ?? "(unknown)"],
                ["TARGET SDK", manifest.targetSdkVersion ?? "(unknown)"],
                ["LABEL", manifest.label ?? "(unknown)"],
            ]);

            if (manifest.permissions && manifest.permissions.length > 0) {
                console.log();
                header("Permissions");
                for (const perm of manifest.permissions) {
                    console.log("  " + perm.replace("android.permission.", ""));
                }
            }

            // ── Checks ──
            let issueCount = 0;
            console.log();
            header("Checks");

            // Version code must be positive integer
            const vc = parseInt(manifest.versionCode, 10);
            if (isNaN(vc) || vc < 1) {
                error("versionCode is invalid or missing.");
                issueCount++;
            } else {
                success(`versionCode ${manifest.versionCode} is valid.`);
            }

            // Version name must be non-empty
            if (!manifest.versionName || manifest.versionName === "0") {
                error("versionName is missing or 0.");
                issueCount++;
            } else {
                success(`versionName "${manifest.versionName}" is present.`);
            }

            // Min SDK — Solana Mobile requires Android 11+ (API 30)
            const minSdk = parseInt(manifest.minSdkVersion ?? "0", 10);
            if (minSdk < 30) {
                warn(
                    `minSdkVersion is ${manifest.minSdkVersion ?? "unset"} — Solana Mobile Seeker requires API 30+.`,
                );
                issueCount++;
            } else {
                success(
                    `minSdkVersion ${manifest.minSdkVersion ?? "?"} meets Solana Mobile requirement (≥ 30).`,
                );
            }

            console.log();
            if (issueCount === 0) {
                info("All checks passed. Ready to upload.");
            } else {
                warn(
                    `${issueCount.toString()} issue${issueCount === 1 ? "" : "s"} found. Fix before uploading.`,
                );
                process.exit(1);
            }
        });
}

function parseManifest(apkPath: string): ApkManifest | null {
    // Try aapt2 first
    const aapt2 = which("aapt2");
    if (aapt2) {
        try {
            const output = execFileSync(aapt2, ["dump", "badging", apkPath], {
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "ignore"],
            });
            return parseAaptOutput(output);
        } catch {
            // fall through to aapt
        }
    }

    // Fallback to aapt
    const aapt = which("aapt");
    if (aapt) {
        try {
            const output = execFileSync(aapt, ["dump", "badging", apkPath], {
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "ignore"],
            });
            return parseAaptOutput(output);
        } catch {
            return null;
        }
    }

    return null;
}

function which(bin: string): string | null {
    const result = spawnSync("which", [bin], { encoding: "utf-8" });
    if (result.status === 0) {
        return result.stdout.trim();
    }
    return null;
}

function parseAaptOutput(output: string): ApkManifest {
    const manifest: ApkManifest = {
        package: "",
        versionName: "",
        versionCode: "0",
        permissions: [],
    };

    for (const line of output.split("\n")) {
        if (line.startsWith("package:")) {
            manifest.package = extractAttr(line, "name") ?? "";
            manifest.versionName = extractAttr(line, "versionName") ?? "";
            manifest.versionCode = extractAttr(line, "versionCode") ?? "0";
        } else if (line.startsWith("sdkVersion:")) {
            const v = line.split("'")[1];
            if (v !== undefined) manifest.minSdkVersion = v;
        } else if (line.startsWith("targetSdkVersion:")) {
            const v = line.split("'")[1];
            if (v !== undefined) manifest.targetSdkVersion = v;
        } else if (line.startsWith("application-label:")) {
            const v = line.split("'")[1];
            if (v !== undefined) manifest.label = v;
        } else if (line.startsWith("uses-permission:")) {
            const perm = extractAttr(line, "name");
            if (perm) manifest.permissions?.push(perm);
        }
    }

    return manifest;
}

function extractAttr(line: string, attr: string): string | undefined {
    const pattern = new RegExp(`${attr}='([^']*)'`);
    const match = pattern.exec(line);
    return match?.[1];
}
