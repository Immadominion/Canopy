import chalk from "chalk";
import { Command } from "commander";

import { readConfig, writeConfig } from "../lib/config.js";
import { die, header, success, table } from "../lib/output.js";

export function registerConfigCommand(program: Command): void {
    const cmd = program
        .command("config")
        .description("manage Canopy CLI configuration");

    cmd
        .command("set-key <apiKey>")
        .description("store an API key in the local config file")
        .action((apiKey: string) => {
            if (apiKey.length < 20) {
                die("API key looks too short — check the value and try again.");
            }
            const config = readConfig();
            config.apiKey = apiKey;
            writeConfig(config);
            // Print only the last 4 chars to confirm without revealing the full key
            const masked = "•".repeat(apiKey.length - 4) + apiKey.slice(-4);
            success(`API key saved (${masked})`);
        });

    cmd
        .command("set-url <url>")
        .description("override the Canopy API base URL (advanced)")
        .action((url: string) => {
            try {
                new URL(url);
            } catch {
                die(`"${url}" is not a valid URL.`);
            }
            const config = readConfig();
            config.apiUrl = url;
            writeConfig(config);
            success(`API URL set to ${url}`);
        });

    cmd
        .command("show")
        .description("display the current configuration")
        .action(() => {
            const config = readConfig();
            header("Canopy CLI Config");
            const apiKey = config.apiKey
                ? "•".repeat(Math.max(0, config.apiKey.length - 4)) +
                config.apiKey.slice(-4)
                : chalk.dim("(not set)");
            table([
                ["API KEY", apiKey],
                ["API URL", config.apiUrl ?? "https://canopy.dev/api/v1 (default)"],
            ]);
            console.log();
        });
}
