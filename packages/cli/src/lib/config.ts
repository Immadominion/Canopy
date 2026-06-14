import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "canopy");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface CanopyConfig {
    apiKey?: string;
    apiUrl?: string;
}

export function readConfig(): CanopyConfig {
    if (!existsSync(CONFIG_FILE)) {
        return {};
    }
    try {
        const raw = readFileSync(CONFIG_FILE, "utf-8");
        return JSON.parse(raw) as CanopyConfig;
    } catch {
        return {};
    }
}

export function writeConfig(config: CanopyConfig): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getApiUrl(config: CanopyConfig): string {
    return config.apiUrl ?? "https://trycanopy.xyz/api/v1";
}

export function requireApiKey(config: CanopyConfig): string {
    const key = config.apiKey;
    if (!key) {
        throw new Error(
            "No API key configured. Run: canopy config set-key <your-api-key>",
        );
    }
    return key;
}
