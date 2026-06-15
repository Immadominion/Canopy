import crypto from "crypto";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Telegram Bot API helper for the manual publisher-approval flow.
 *
 * Outbound: notify the founder of a new access request with inline
 * Approve/Reject buttons. Inbound taps arrive at the webhook route, which
 * verifies (a) the X-Telegram-Bot-Api-Secret-Token header, (b) that the tap
 * came from the admin chat id, and (c) the HMAC signature embedded in the
 * button's callback_data. All three must pass before a decision is applied.
 *
 * Everything here is best-effort and non-fatal: when the bot vars are unset,
 * notifications are skipped and the user can still reach out via the prefilled
 * t.me link shown in the dashboard.
 */

const log = logger.child({ module: "telegram" });
const API_BASE = "https://api.telegram.org";

export function telegramConfigured(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID);
}

/**
 * HMAC-sign a callback action so only Canopy-issued buttons are honored.
 * Truncated to 10 hex chars to stay within Telegram's 64-byte callback_data cap.
 */
export function signAction(action: string): string {
    return crypto.createHmac("sha256", env.JWT_SECRET).update(action).digest("hex").slice(0, 10);
}

export function verifyActionSig(action: string, sig: string): boolean {
    const expected = signAction(action);
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

async function call(method: string, body: unknown): Promise<void> {
    if (!env.TELEGRAM_BOT_TOKEN) return;
    let res: Response;
    try {
        res = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch (err) {
        log.warn({ err, method }, "Telegram API request failed");
        return;
    }
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        log.warn({ method, status: res.status, text }, "Telegram API returned non-200");
    } else {
        log.info({ method, status: res.status }, "Telegram API ok");
    }
}

function escapeHtml(s: string): string {
    // Escape the three characters significant in Telegram's HTML parse_mode.
    // HTML mode is far more robust than legacy Markdown for user-supplied text:
    // a complete escape is possible (Markdown can't escape every metacharacter,
    // so an odd `*`/`_` in a project summary would 400 and drop the message).
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Notify the founder of a new access request with inline Approve/Reject buttons. */
export async function notifyAccessRequest(opts: {
    requestId: string;
    code: string;
    displayName: string;
    projectSummary: string;
    walletShort: string;
    contactTelegram?: string | null;
    onchainAppNft: boolean | null;
}): Promise<void> {
    if (!telegramConfigured()) {
        log.warn(
            { requestId: opts.requestId },
            "Telegram not configured (bot token / admin chat id unset) — skipping access-request notification",
        );
        return;
    }

    log.info(
        { requestId: opts.requestId, code: opts.code },
        "Sending access-request Telegram notification",
    );

    const approve = `ar:a:${opts.requestId}`;
    const reject = `ar:r:${opts.requestId}`;

    const onchain =
        opts.onchainAppNft === null ? "unknown" : opts.onchainAppNft ? "yes ✅" : "none ⚠️";

    const text = [
        "🌳 <b>Canopy — access request</b>",
        "",
        `<b>Name:</b> ${escapeHtml(opts.displayName)}`,
        `<b>Building:</b> ${escapeHtml(opts.projectSummary)}`,
        `<b>Wallet:</b> <code>${escapeHtml(opts.walletShort)}</code>`,
        opts.contactTelegram ? `<b>Telegram:</b> ${escapeHtml(opts.contactTelegram)}` : null,
        `<b>On-chain app NFT:</b> ${onchain}`,
        `<b>Code:</b> <code>${escapeHtml(opts.code)}</code>`,
    ]
        .filter((l): l is string => l !== null)
        .join("\n");

    await call("sendMessage", {
        chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
        text,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Approve", callback_data: `${approve}:${signAction(approve)}` },
                    { text: "✕ Reject", callback_data: `${reject}:${signAction(reject)}` },
                ],
            ],
        },
    });

    log.info({ requestId: opts.requestId }, "Access-request Telegram notification dispatched");
}

export async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
    await call("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export async function editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
): Promise<void> {
    await call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
    });
}
