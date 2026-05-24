import { createReadStream, existsSync, statSync } from "node:fs";
import { basename } from "node:path";

import { Command } from "commander";
import ora from "ora";

import { CanopyApiError, createApiClient } from "../lib/api.js";
import { readConfig, requireApiKey } from "../lib/config.js";
import { die, error, header, info, table } from "../lib/output.js";

interface BetaTrack {
    id: string;
    app_id: string;
    version_name: string;
    version_code: number;
    status: string;
    tester_count: number;
    tester_cap: number;
    expires_at: string;
    created_at: string;
    release_notes?: string;
}

interface CreateTrackResponse {
    data: BetaTrack;
}

interface ListTracksResponse {
    data: BetaTrack[];
    cursor: string | null;
}

export function registerBetaCommand(program: Command): void {
    const cmd = program
        .command("beta")
        .description("manage beta distribution tracks");

    // ── canopy beta create ──────────────────────────────────────────────────────
    cmd
        .command("create")
        .description("upload an APK and create a new beta track")
        .requiredOption("--app <appId>", "app UUID from the Canopy dashboard")
        .requiredOption("--apk <path>", "path to the signed .apk file")
        .requiredOption("--version-name <name>", "version name string (e.g. 1.2.3)")
        .requiredOption(
            "--version-code <code>",
            "integer version code (must be higher than previous)",
            parseInt,
        )
        .option(
            "--expires-in <days>",
            "days until the track expires (1–30, default 30)",
            parseInt,
            30,
        )
        .option("--notes <text>", "release notes for testers (max 2000 chars)")
        .action(
            async (opts: {
                app: string;
                apk: string;
                versionName: string;
                versionCode: number;
                expiresIn: number;
                notes?: string;
            }) => {
                const config = readConfig();
                requireApiKey(config); // Throws if not set

                // Validate APK path
                if (!existsSync(opts.apk)) {
                    die(`APK file not found: ${opts.apk}`);
                }
                if (!opts.apk.endsWith(".apk")) {
                    die("File must have a .apk extension.");
                }
                const apkStat = statSync(opts.apk);
                const MAX_APK_BYTES = 200 * 1024 * 1024;
                if (apkStat.size > MAX_APK_BYTES) {
                    die(
                        `APK is too large (${(apkStat.size / 1024 / 1024).toFixed(1)} MB). Maximum is 200 MB.`,
                    );
                }
                if (opts.expiresIn < 1 || opts.expiresIn > 30) {
                    die("--expires-in must be between 1 and 30 days.");
                }
                if (opts.notes && opts.notes.length > 2000) {
                    die(
                        `--notes exceeds 2000 characters (${opts.notes.length.toString()} chars).`,
                    );
                }

                const spinner = ora(
                    `Uploading ${basename(opts.apk)} (${(apkStat.size / 1024 / 1024).toFixed(1)} MB)…`,
                ).start();

                try {
                    const api = createApiClient(config);
                    const form = new FormData();

                    // Node 24 supports FormData natively but doesn't handle ReadStream —
                    // read the file as a Blob for the upload
                    const fileBuffer = await readFileAsBuffer(opts.apk);
                    const blob = new Blob([fileBuffer], {
                        type: "application/vnd.android.package-archive",
                    });
                    form.append("apk", blob, basename(opts.apk));
                    form.append("appId", opts.app);
                    form.append("versionName", opts.versionName);
                    form.append("versionCode", opts.versionCode.toString());
                    form.append("expiresInDays", opts.expiresIn.toString());
                    if (opts.notes) {
                        form.append("releaseNotes", opts.notes);
                    }

                    spinner.text = "Creating beta track…";
                    const result = await api.postForm<CreateTrackResponse>(
                        "/beta/upload",
                        form,
                    );
                    const track = result.data;

                    spinner.succeed("Beta track created.");
                    header("Beta Track");
                    table([
                        ["TRACK ID", track.id],
                        ["APP ID", track.app_id],
                        ["VERSION", `${track.version_name} (${track.version_code.toString()})`],
                        ["STATUS", track.status],
                        ["TESTERS", `${track.tester_count.toString()} / ${track.tester_cap.toString()}`],
                        ["EXPIRES", new Date(track.expires_at).toLocaleString()],
                    ]);
                    console.log();
                    info("Track is pending malware scan. It activates automatically once clear.");
                } catch (err) {
                    spinner.fail("Upload failed.");
                    handleApiError(err);
                }
            },
        );

    // ── canopy beta status ──────────────────────────────────────────────────────
    cmd
        .command("status")
        .description("list beta tracks for an app")
        .requiredOption("--app <appId>", "app UUID from the Canopy dashboard")
        .option(
            "--status <filter>",
            "filter by status: active, pending, expired, closed",
        )
        .action(
            async (opts: {
                app: string;
                status?: string;
            }) => {
                const config = readConfig();
                requireApiKey(config);

                const spinner = ora("Fetching beta tracks…").start();
                try {
                    const api = createApiClient(config);
                    const qs = opts.status ? `?status=${opts.status}` : "";
                    const result = await api.get<ListTracksResponse>(
                        `/apps/${opts.app}/beta${qs}`,
                    );
                    spinner.stop();

                    if (result.data.length === 0) {
                        info("No beta tracks found.");
                        return;
                    }

                    header(`Beta Tracks — ${opts.app}`);
                    for (const track of result.data) {
                        const expires = new Date(track.expires_at).toLocaleDateString();
                        console.log(
                            `  ${track.id}  ${track.version_name.padEnd(16)}  ${track.status.padEnd(16)}  ${track.tester_count.toString().padStart(3)}/${track.tester_cap.toString()}  exp ${expires}`,
                        );
                    }
                    console.log();
                } catch (err) {
                    spinner.fail("Failed to fetch tracks.");
                    handleApiError(err);
                }
            },
        );

    // ── canopy beta close ───────────────────────────────────────────────────────
    cmd
        .command("close <trackId>")
        .description("close a beta track and revoke all download links")
        .action(async (trackId: string) => {
            const config = readConfig();
            requireApiKey(config);

            const spinner = ora(`Closing track ${trackId}…`).start();
            try {
                const api = createApiClient(config);
                await api.patch<{ data: BetaTrack }>(
                    `/beta/tracks/${trackId}`,
                    { action: "close" },
                );
                spinner.succeed(`Track ${trackId} closed.`);
            } catch (err) {
                spinner.fail("Close failed.");
                handleApiError(err);
            }
        });
}

/** Read a file into a Buffer using streams to handle large APKs efficiently. */
function readFileAsBuffer(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = createReadStream(filePath);
        stream.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        stream.on("end", () => {
            resolve(Buffer.concat(chunks));
        });
        stream.on("error", reject);
    });
}

function handleApiError(err: unknown): never {
    if (err instanceof CanopyApiError) {
        error(`${err.code}: ${err.message}`);
        if (err.statusCode === 401) {
            info("Run `canopy config set-key <key>` to update your API key.");
        }
    } else if (err instanceof Error) {
        error(err.message);
    } else {
        error("An unexpected error occurred.");
    }
    process.exit(1);
}
