import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
    answerCallback,
    editMessageText,
    verifyActionSig,
} from "@/lib/telegram/client";
import { decideAccessRequest, type Decision } from "@/lib/verification/access";

const log = logger.child({ route: "POST /api/v1/telegram/webhook" });

/**
 * Telegram webhook for inline Approve/Reject taps.
 *
 * Three independent checks must all pass before a decision is applied:
 *   1. X-Telegram-Bot-Api-Secret-Token header == TELEGRAM_WEBHOOK_SECRET
 *   2. callback_query.from.id == TELEGRAM_ADMIN_CHAT_ID  (only the founder)
 *   3. HMAC signature embedded in the button's callback_data
 *
 * Always returns 200 so Telegram does not retry; failures are silent no-ops.
 */
export async function POST(request: Request): Promise<NextResponse> {
    // Feature disabled unless fully configured.
    if (!env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_ADMIN_CHAT_ID) {
        return NextResponse.json({ ok: true });
    }

    // (1) Verify the webhook secret header.
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        log.warn("Telegram webhook secret mismatch");
        return NextResponse.json({ ok: true });
    }

    let update: unknown;
    try {
        update = await request.json();
    } catch {
        return NextResponse.json({ ok: true });
    }

    const cb = (update as { callback_query?: TelegramCallbackQuery }).callback_query;
    if (!cb) return NextResponse.json({ ok: true }); // ignore non-callback updates

    // (2) Only the admin chat may decide.
    const fromId = cb.from?.id;
    if (fromId === undefined || String(fromId) !== String(env.TELEGRAM_ADMIN_CHAT_ID)) {
        await answerCallback(cb.id, "Not authorized");
        return NextResponse.json({ ok: true });
    }

    // Parse callback_data: "ar:<a|r>:<uuid>:<sig>"
    const parts = (cb.data ?? "").split(":");
    if (parts.length !== 4 || parts[0] !== "ar") {
        await answerCallback(cb.id, "Unrecognized action");
        return NextResponse.json({ ok: true });
    }
    const [, actionCode, requestId, sig] = parts as [string, string, string, string];
    const payload = `ar:${actionCode}:${requestId}`;

    // (3) Verify the HMAC signature.
    if (!verifyActionSig(payload, sig)) {
        log.warn({ requestId }, "Telegram callback signature invalid");
        await answerCallback(cb.id, "Invalid signature");
        return NextResponse.json({ ok: true });
    }

    const decision: Decision | null =
        actionCode === "a" ? "approve" : actionCode === "r" ? "reject" : null;
    if (!decision) {
        await answerCallback(cb.id, "Unknown decision");
        return NextResponse.json({ ok: true });
    }

    const result = await decideAccessRequest({
        requestId,
        decision,
        decidedBy: `telegram:${fromId}`,
    });

    if (!result.ok) {
        await answerCallback(cb.id, "Request not found");
        return NextResponse.json({ ok: true });
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

    return NextResponse.json({ ok: true });
}

function escapeName(s: string): string {
    // Matches the HTML parse_mode used by editMessageText.
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface TelegramCallbackQuery {
    id: string;
    data?: string;
    from?: { id: number };
    message?: { message_id: number; chat: { id: number } };
}
