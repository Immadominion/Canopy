#!/usr/bin/env node
/**
 * One-shot Telegram bot setup for the Canopy founder admin console.
 *
 *   1. Points the webhook at your deployment (fixes the stale trycloudflare URL)
 *   2. Registers the public read-only command menu (default scope)
 *   3. Registers the full command menu in your admin chat only (chat scope)
 *
 * Usage (Node 20+, run from apps/web):
 *   node --env-file=.env.local scripts/telegram-setup.mjs https://www.trycanopy.xyz
 *
 * The base URL arg is optional; it falls back to NEXT_PUBLIC_APP_URL, then to
 * https://www.trycanopy.xyz. Reads TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET
 * / TELEGRAM_ADMIN_CHAT_ID from the environment — never hard-code them here.
 *
 * Keep the command lists below in sync with src/lib/telegram/router.ts.
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
const baseUrl =
    process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || "https://www.trycanopy.xyz";

if (!token) {
    console.error("✕ TELEGRAM_BOT_TOKEN is not set. Run with --env-file=.env.local");
    process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/telegram/webhook`;

// Public menu — read-only commands shown to anyone.
const PUBLIC_COMMANDS = [
    { command: "help", description: "List all commands" },
    { command: "pending", description: "Open access-request queue" },
    { command: "request", description: "Request detail <CODE>" },
    { command: "publisher", description: "Publisher profile <wallet|hash|CODE>" },
    { command: "tracks", description: "Live beta tracks" },
    { command: "track", description: "Track detail <id>" },
    { command: "scanqueue", description: "Scan-pipeline status" },
    { command: "expiring", description: "Tracks expiring soon [days]" },
    { command: "stats", description: "Platform top-line digest" },
    { command: "crashes", description: "Recent crashes [24h|7d]" },
    { command: "health", description: "System + scan health" },
];

// Full menu — read + state-changing, shown only in the founder's chat.
const ADMIN_COMMANDS = [
    ...PUBLIC_COMMANDS,
    { command: "approve", description: "Approve <CODE>" },
    { command: "reject", description: "Reject <CODE>" },
    { command: "ban", description: "Ban a publisher <wallet|hash|CODE>" },
    { command: "unban", description: "Unban a publisher <wallet|hash|CODE>" },
    { command: "revoke", description: "Revoke a track <id>" },
    { command: "extend", description: "Extend a track <id> <days>" },
    { command: "trigger", description: "Run a cron job <expire-cleanup|scan-recheck>" },
    { command: "whoami", description: "Your chat id + admin status" },
];

async function api(method, body) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
    return json.result;
}

async function main() {
    console.log(`→ Setting webhook to ${webhookUrl}`);
    await api("setWebhook", {
        url: webhookUrl,
        secret_token: secret || undefined,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
    });
    console.log("  ✓ webhook set");
    if (!secret) console.log("  ⚠ TELEGRAM_WEBHOOK_SECRET not set — webhook has no secret header.");

    console.log("→ Registering public command menu");
    await api("setMyCommands", { commands: PUBLIC_COMMANDS });
    console.log("  ✓ public menu registered");

    if (adminChatId) {
        console.log(`→ Registering full command menu for chat ${adminChatId}`);
        await api("setMyCommands", {
            commands: ADMIN_COMMANDS,
            scope: { type: "chat", chat_id: Number(adminChatId) },
        });
        console.log("  ✓ admin menu registered");
    } else {
        console.log("  ⚠ TELEGRAM_ADMIN_CHAT_ID not set — skipped admin-scope menu.");
    }

    const info = await api("getWebhookInfo");
    console.log("\nWebhook status:");
    console.log(`  url: ${info.url}`);
    console.log(`  pending updates: ${info.pending_update_count}`);
    console.log(`  last error: ${info.last_error_message ?? "none"}`);
    console.log("\n✅ Done.");
}

main().catch((err) => {
    console.error(`\n✕ ${err.message}`);
    process.exit(1);
});
