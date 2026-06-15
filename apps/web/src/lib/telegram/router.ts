import { after } from "next/server";

import { editMessageText, verifyActionSig } from "@/lib/telegram/client";
import { esc } from "@/lib/telegram/format";
import type { CommandCtx, CommandHandler, ConfirmResult, Reply } from "@/lib/telegram/types";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { revokeTrack, extendTrackExpiry } from "@/lib/beta/admin-ops";
import { banPublisher, unbanPublisher } from "@/lib/verification/ban";

import * as approvals from "@/lib/telegram/commands/approvals";
import * as betas from "@/lib/telegram/commands/betas";
import * as insights from "@/lib/telegram/commands/insights";
import * as ops from "@/lib/telegram/commands/ops";
import * as publishers from "@/lib/telegram/commands/publishers";

const log = logger.child({ module: "telegram/router" });

interface CommandEntry {
    name: string;
    group: string;
    summary: string;
    handler: CommandHandler;
    /** false = answerable by anyone (start/whoami); true = admin chat only. */
    adminOnly: boolean;
    /** Show in the public BotFather menu (read-only commands only). */
    menu: boolean;
}

// ── Registry ────────────────────────────────────────────────────────────────
// One table drives dispatch AND /help, so they can never drift apart.
const COMMANDS: CommandEntry[] = [
    // System
    { name: "start", group: "System", summary: "About this bot", handler: ops.start, adminOnly: false, menu: false },
    { name: "help", group: "System", summary: "List all commands", handler: help, adminOnly: true, menu: true },
    { name: "whoami", group: "System", summary: "Your chat id + admin status", handler: ops.whoami, adminOnly: false, menu: false },
    { name: "health", group: "System", summary: "System + scan-pipeline health", handler: ops.health, adminOnly: true, menu: true },
    { name: "trigger", group: "System", summary: "Run a cron job <expire-cleanup|scan-recheck>", handler: ops.trigger, adminOnly: true, menu: false },

    // Approvals
    { name: "pending", group: "Approvals", summary: "Open access-request queue", handler: approvals.pending, adminOnly: true, menu: true },
    { name: "request", group: "Approvals", summary: "Request detail <CODE>", handler: approvals.request, adminOnly: true, menu: true },
    { name: "approve", group: "Approvals", summary: "Approve <CODE>", handler: approvals.approve, adminOnly: true, menu: false },
    { name: "reject", group: "Approvals", summary: "Reject <CODE>", handler: approvals.reject, adminOnly: true, menu: false },

    // Publishers
    { name: "publisher", group: "Publishers", summary: "Profile <wallet|hash|CODE>", handler: publishers.publisher, adminOnly: true, menu: true },
    { name: "ban", group: "Publishers", summary: "Ban a publisher <wallet|hash|CODE>", handler: publishers.ban, adminOnly: true, menu: false },
    { name: "unban", group: "Publishers", summary: "Unban a publisher <wallet|hash|CODE>", handler: publishers.unban, adminOnly: true, menu: false },

    // Betas & scans
    { name: "tracks", group: "Betas & scans", summary: "Live beta tracks", handler: betas.tracks, adminOnly: true, menu: true },
    { name: "track", group: "Betas & scans", summary: "Track detail <id>", handler: betas.track, adminOnly: true, menu: true },
    { name: "scanqueue", group: "Betas & scans", summary: "Scan-pipeline status", handler: betas.scanqueue, adminOnly: true, menu: true },
    { name: "expiring", group: "Betas & scans", summary: "Tracks expiring soon [days]", handler: betas.expiring, adminOnly: true, menu: true },
    { name: "revoke", group: "Betas & scans", summary: "Revoke a track <id>", handler: betas.revoke, adminOnly: true, menu: false },
    { name: "extend", group: "Betas & scans", summary: "Extend a track <id> <days>", handler: betas.extend, adminOnly: true, menu: false },

    // Insights
    { name: "stats", group: "Insights", summary: "Platform top-line digest", handler: insights.stats, adminOnly: true, menu: true },
    { name: "crashes", group: "Insights", summary: "Recent crashes [24h|7d]", handler: insights.crashes, adminOnly: true, menu: true },
];

const REGISTRY = new Map(COMMANDS.map((c) => [c.name, c]));

/** /help — grouped command list, generated from the registry. */
function help(): Promise<Reply> {
    const groups = new Map<string, CommandEntry[]>();
    for (const c of COMMANDS) {
        const arr = groups.get(c.group) ?? [];
        arr.push(c);
        groups.set(c.group, arr);
    }
    const sections = [...groups.entries()].map(([group, cmds]) => {
        const lines = cmds.map((c) => `/${c.name} — ${esc(c.summary)}`);
        return `<b>${esc(group)}</b>\n${lines.join("\n")}`;
    });
    return Promise.resolve({ text: `🌳 <b>Canopy admin console</b>\n\n${sections.join("\n\n")}` });
}

function parse(text: string): { cmd: string; args: string[] } {
    const parts = text.trim().split(/\s+/);
    let cmd = (parts[0] ?? "").toLowerCase().replace(/^\//, "");
    const at = cmd.indexOf("@"); // strip /cmd@BotName form used in groups
    if (at !== -1) cmd = cmd.slice(0, at);
    return { cmd, args: parts.slice(1) };
}

function isAdmin(ctx: { fromId?: number | undefined; chatId: number | string }): boolean {
    return String(ctx.fromId ?? ctx.chatId) === String(env.TELEGRAM_ADMIN_CHAT_ID);
}

/**
 * Route a typed command to its handler. Returns the reply to send, or null to
 * stay silent. The admin gate is applied here (except for adminOnly:false).
 */
export async function dispatchCommand(input: {
    text: string;
    fromId?: number | undefined;
    chatId: number | string;
}): Promise<Reply | null> {
    const { cmd, args } = parse(input.text);
    const entry = REGISTRY.get(cmd);
    if (!entry) return { text: `Unknown command /${esc(cmd)}. Send /help.` };

    if (entry.adminOnly && !isAdmin(input)) return { text: "⛔ Not authorized." };

    const ctx: CommandCtx = { chatId: input.chatId, fromId: input.fromId };
    try {
        return await entry.handler(args, ctx);
    } catch (err) {
        log.warn({ err, cmd }, "Command handler threw");
        return { text: "⚠️ Something went wrong running that command." };
    }
}

/** Self-invoke a secured cron endpoint (same path Vercel Cron hits). */
async function runCron(job: string): Promise<{ ok: boolean; summary: string }> {
    try {
        const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/v1/cron/${job}`, {
            headers: env.CRON_SECRET ? { Authorization: `Bearer ${env.CRON_SECRET}` } : {},
        });
        const body = await res.text();
        return { ok: res.ok, summary: body.slice(0, 300) };
    } catch (err) {
        return { ok: false, summary: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Handle a confirmation-button tap for the new admin actions (revoke, extend,
 * ban, unban, trigger, cancel). The legacy `ar:` approve/reject taps are handled
 * directly in the webhook route. Returns null for an unrecognized prefix.
 *
 * Every state change re-verifies the HMAC signature embedded in callback_data,
 * so a tap can only fire from a Canopy-issued button.
 */
export async function dispatchConfirm(
    data: string,
    msg?: { chatId: number | string; messageId: number },
): Promise<ConfirmResult | null> {
    if (data === "x:cancel") return { answer: "Cancelled", edit: "✕ Cancelled." };

    const parts = data.split(":");
    const prefix = `${parts[0] ?? ""}:${parts[1] ?? ""}`;
    const by = `telegram:${msg?.chatId ?? "admin"}`;

    switch (prefix) {
        case "bt:rv": {
            const [, , id, sig] = parts;
            if (!id || !sig || !verifyActionSig(`bt:rv:${id}`, sig)) return { answer: "Invalid signature" };
            const r = await revokeTrack(id);
            return r.ok
                ? { answer: "Revoked", edit: "⚫ Track revoked and APK purged." }
                : { answer: "Revoke failed", edit: `⚠️ Revoke failed (${r.reason}).` };
        }
        case "bt:ex": {
            const [, , id, daysStr, sig] = parts;
            const days = Number.parseInt(daysStr ?? "", 10);
            if (!id || !sig || !Number.isFinite(days) || !verifyActionSig(`bt:ex:${id}:${days}`, sig)) {
                return { answer: "Invalid signature" };
            }
            const r = await extendTrackExpiry(id, days);
            if (!r.ok) return { answer: "Extend failed", edit: `⚠️ Extend failed (${r.reason}).` };
            return { answer: "Extended", edit: `🟢 Expiry extended${r.capped ? " (capped at 30d)" : ""}.` };
        }
        case "pub:bn": {
            const [, , id, sig] = parts;
            if (!id || !sig || !verifyActionSig(`pub:bn:${id}`, sig)) return { answer: "Invalid signature" };
            const r = await banPublisher(id, by);
            return r.ok
                ? { answer: "Banned", edit: "🚫 Publisher banned." }
                : { answer: "Ban failed", edit: "⚠️ Ban failed." };
        }
        case "pub:ub": {
            const [, , id, sig] = parts;
            if (!id || !sig || !verifyActionSig(`pub:ub:${id}`, sig)) return { answer: "Invalid signature" };
            const r = await unbanPublisher(id, by);
            return r.ok
                ? { answer: "Unbanned", edit: "♻️ Publisher unbanned." }
                : { answer: "Unban failed", edit: "⚠️ Unban failed." };
        }
        case "op:tr": {
            const [, , jobCode, sig] = parts;
            if (!jobCode || !sig || !verifyActionSig(`op:tr:${jobCode}`, sig)) return { answer: "Invalid signature" };
            const job = jobCode === "ec" ? "expire-cleanup" : jobCode === "sr" ? "scan-recheck" : null;
            if (!job) return { answer: "Unknown job" };
            // Cron can run for minutes — settle after responding, then edit the message.
            if (msg) {
                after(async () => {
                    const res = await runCron(job);
                    await editMessageText(
                        msg.chatId,
                        msg.messageId,
                        res.ok
                            ? `✅ <b>${job}</b> done.\n<code>${esc(res.summary)}</code>`
                            : `⚠️ <b>${job}</b> failed.\n<code>${esc(res.summary)}</code>`,
                    );
                });
            }
            return { answer: `Running ${job}…`, edit: `⏳ Running <b>${job}</b>…` };
        }
        default:
            return null;
    }
}
