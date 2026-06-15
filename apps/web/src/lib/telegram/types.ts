/**
 * Shared types for the Telegram founder admin console.
 *
 * Kept in their own module so the command handlers and the router can share
 * them without an import cycle (router imports handlers; handlers import types).
 */

/** A bot reply: HTML text plus an optional inline keyboard (reply_markup). */
export interface Reply {
    text: string;
    replyMarkup?: unknown;
}

/** Context every command handler receives. */
export interface CommandCtx {
    /** The chat the command arrived from (always the admin chat once gated). */
    chatId: number | string;
    /** The Telegram user id that sent the command. */
    fromId?: number | undefined;
}

export type CommandHandler = (args: string[], ctx: CommandCtx) => Promise<Reply>;

/** Result of a confirmation-button tap. */
export interface ConfirmResult {
    /** Toast shown on the tapped button (answerCallbackQuery). */
    answer: string;
    /** If set, the original message is edited to this HTML. */
    edit?: string;
}
