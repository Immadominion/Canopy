import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
    answerCallback,
    editMessageText,
    sendMessage,
    verifyActionSig,
} from "@/lib/telegram/client";
import { dispatchCommand, dispatchConfirm } from "@/lib/telegram/router";
import { decideAccessRequest, type Decision } from "@/lib/verification/access";

export const runtime = "nodejs";
// Give the post-response after() work (e.g. /trigger running a cron, then
// editing the message with the result) the full function window.
export const maxDuration = 60;

const log = logger.child({ route: "POST /api/v1/telegram/webhook" });

const OK = () => NextResponse.json({ ok: true });

/**
 * Telegram webhook — the founder admin console's inbound channel.
 *
 * Handles three kinds of update, all behind the same two non-negotiable gates
 * (webhook secret header + admin chat id):
 *   1. Typed slash commands (message.text starting with "/") → command router
 *   2. Legacy approve/reject taps (callback_data "ar:…") → access decision
 *   3. New admin confirm taps (revoke/extend/ban/unban/trigger/cancel) → router
 *
 * Always returns 200 so Telegram does not retry; failures are silent no-ops.
 */
export async function POST(request: Request): Promise<NextResponse> {
    // Feature disabled unless fully configured.
    if (!env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_ADMIN_CHAT_ID) return OK();

    // (1) Verify the webhook secret header.
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        log.warn("Telegram webhook secret mismatch");
        return OK();
    }

    let update: unknown;
    try {
        update = await request.json();
    } catch {
        return OK();
    }

    // ── Typed slash command ──────────────────────────────────────────────────
    const message = (update as { message?: TelegramMessage }).message;
    if (message?.text && message.text.startsWith("/")) {
        const reply = await dispatchCommand({
            text: message.text,
            fromId: message.from?.id,
            chatId: message.chat.id,
        });
        if (reply) {
            await sendMessage(message.chat.id, reply.text, { replyMarkup: reply.replyMarkup });
        }
        return OK();
    }

    // ── Callback query (button tap) ──────────────────────────────────────────
    const cb = (update as { callback_query?: TelegramCallbackQuery }).callback_query;
    if (!cb) return OK(); // ignore non-message, non-callback updates

    // Only the admin chat may act.
    const fromId = cb.from?.id;
    if (fromId === undefined || String(fromId) !== String(env.TELEGRAM_ADMIN_CHAT_ID)) {
        await answerCallback(cb.id, "Not authorized");
        return OK();
    }

    const data = cb.data ?? "";

    // (2) Legacy approve/reject buttons.
    if (data.startsWith("ar:")) {
        await handleAccessDecision(cb, data);
        return OK();
    }

    // (3) New admin confirm buttons (revoke/extend/ban/unban/trigger/cancel).
    const res = await dispatchConfirm(
        data,
        cb.message ? { chatId: cb.message.chat.id, messageId: cb.message.message_id } : undefined,
    );
    if (!res) {
        await answerCallback(cb.id, "Unrecognized action");
        return OK();
    }
    await answerCallback(cb.id, res.answer);
    if (res.edit && cb.message) {
        await editMessageText(cb.message.chat.id, cb.message.message_id, res.edit);
    }
    return OK();
}

/**
 * Apply an approve/reject decision from an inline button. callback_data shape:
 * "ar:<a|r>:<uuid>:<sig>". The HMAC sig must verify before the decision applies.
 */
async function handleAccessDecision(cb: TelegramCallbackQuery, data: string): Promise<void> {
    const parts = data.split(":");
    if (parts.length !== 4 || parts[0] !== "ar") {
        await answerCallback(cb.id, "Unrecognized action");
        return;
    }
    const [, actionCode, requestId, sig] = parts as [string, string, string, string];
    const payload = `ar:${actionCode}:${requestId}`;

    if (!verifyActionSig(payload, sig)) {
        log.warn({ requestId }, "Telegram callback signature invalid");
        await answerCallback(cb.id, "Invalid signature");
        return;
    }

    const decision: Decision | null =
        actionCode === "a" ? "approve" : actionCode === "r" ? "reject" : null;
    if (!decision) {
        await answerCallback(cb.id, "Unknown decision");
        return;
    }

    const result = await decideAccessRequest({
        requestId,
        decision,
        decidedBy: `telegram:${cb.from?.id ?? "admin"}`,
    });

    if (!result.ok) {
        await answerCallback(cb.id, "Request not found");
        return;
    }

    const verb = decision === "approve" ? "Approved ✅" : "Rejected ✕";
    const note = result.alreadyDecided ? " (already decided)" : "";
    await answerCallback(cb.id, `${verb}${note}`);

    if (cb.message) {
        await editMessageText(
            cb.message.chat.id,
            cb.message.message_id,
            `🌳 <b>Canopy</b> — <b>${escapeName(result.displayName)}</b> → <b>${verb}</b>${note}`,
        );
    }
}

function escapeName(s: string): string {
    // Matches the HTML parse_mode used by editMessageText.
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface TelegramMessage {
    message_id: number;
    text?: string;
    from?: { id: number };
    chat: { id: number };
}

interface TelegramCallbackQuery {
    id: string;
    data?: string;
    from?: { id: number };
    message?: { message_id: number; chat: { id: number } };
}
