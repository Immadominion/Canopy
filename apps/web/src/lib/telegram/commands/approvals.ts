import { signAction } from "@/lib/telegram/client";
import { ago, b, clip, code, esc, shortHash } from "@/lib/telegram/format";
import type { CommandCtx, Reply } from "@/lib/telegram/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { decideAccessRequest } from "@/lib/verification/access";

/** Inline approve/reject buttons for a pending request (reuse the ar: handler). */
function decisionKeyboard(requestId: string): unknown {
    const approve = `ar:a:${requestId}`;
    const reject = `ar:r:${requestId}`;
    return {
        inline_keyboard: [
            [
                { text: "✅ Approve", callback_data: `${approve}:${signAction(approve)}` },
                { text: "✕ Reject", callback_data: `${reject}:${signAction(reject)}` },
            ],
        ],
    };
}

/** /pending — the queue of open access requests, oldest first. */
export async function pending(): Promise<Reply> {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
        .from("access_requests")
        .select("code, display_name, project_summary, created_at, onchain_app_nft")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(15);

    if (!data || data.length === 0) return { text: "✅ No pending access requests." };

    const lines = data.map((r) => {
        const nft = r.onchain_app_nft ? " · NFT ✅" : "";
        return `${b(r.display_name)} · ${code(r.code)} · ${ago(r.created_at)}${nft}\n${clip(r.project_summary, 80)}`;
    });

    return {
        text:
            `🕓 <b>Pending requests (${data.length})</b>\n\n` +
            `${lines.join("\n\n")}\n\n` +
            `Inspect with /request &lt;CODE&gt; · approve with /approve &lt;CODE&gt;`,
    };
}

/** /request <CODE> — full detail of one access request, with action buttons if pending. */
export async function request(args: string[]): Promise<Reply> {
    const codeArg = (args[0] ?? "").toUpperCase();
    if (!codeArg) return { text: "Usage: /request &lt;CODE&gt;" };

    const admin = createSupabaseAdminClient();
    const { data: r } = await admin
        .from("access_requests")
        .select(
            "id, code, display_name, project_summary, contact_telegram, onchain_app_nft, status, wallet_hash, created_at, decided_at, decided_by",
        )
        .eq("code", codeArg)
        .maybeSingle();

    if (!r) return { text: `No request found for code ${code(codeArg)}.` };

    const onchain = r.onchain_app_nft === null ? "unknown" : r.onchain_app_nft ? "yes ✅" : "none ⚠️";
    const lines = [
        `${b(r.display_name)} · ${code(r.code)} · ${b(r.status)}`,
        `Wallet: ${code(shortHash(r.wallet_hash))}`,
        r.contact_telegram ? `Telegram: ${esc(r.contact_telegram)}` : null,
        `On-chain NFT: ${onchain}`,
        `Submitted: ${ago(r.created_at)}`,
        r.decided_at ? `Decided: ${ago(r.decided_at)} by ${code(r.decided_by ?? "?")}` : null,
        "",
        esc(r.project_summary),
    ].filter((l): l is string => l !== null);

    const reply: Reply = { text: lines.join("\n") };
    if (r.status === "pending") reply.replyMarkup = decisionKeyboard(r.id);
    return reply;
}

/** /approve <CODE> — approve immediately (the happy path; no confirm needed). */
export async function approve(args: string[], ctx: CommandCtx): Promise<Reply> {
    const codeArg = (args[0] ?? "").toUpperCase();
    if (!codeArg) return { text: "Usage: /approve &lt;CODE&gt;" };

    const admin = createSupabaseAdminClient();
    const { data: r } = await admin
        .from("access_requests")
        .select("id")
        .eq("code", codeArg)
        .maybeSingle();

    if (!r) return { text: `No request found for code ${code(codeArg)}.` };

    const res = await decideAccessRequest({
        requestId: r.id,
        decision: "approve",
        decidedBy: `telegram:${ctx.chatId}`,
    });
    if (!res.ok) return { text: "Request not found." };

    const note = res.alreadyDecided ? " (was already decided)" : "";
    return { text: `✅ Approved ${b(res.displayName)}${note}.` };
}

/** /reject <CODE> — destructive, so reply with a confirm button (reuses ar:r:). */
export async function reject(args: string[]): Promise<Reply> {
    const codeArg = (args[0] ?? "").toUpperCase();
    if (!codeArg) return { text: "Usage: /reject &lt;CODE&gt;" };

    const admin = createSupabaseAdminClient();
    const { data: r } = await admin
        .from("access_requests")
        .select("id, display_name, status")
        .eq("code", codeArg)
        .maybeSingle();

    if (!r) return { text: `No request found for code ${code(codeArg)}.` };
    if (r.status !== "pending") {
        return { text: `Request for ${b(r.display_name)} is already ${b(r.status)}.` };
    }

    const action = `ar:r:${r.id}`;
    return {
        text: `Reject access for ${b(r.display_name)} (${code(codeArg)})?`,
        replyMarkup: {
            inline_keyboard: [
                [
                    { text: "✕ Confirm reject", callback_data: `${action}:${signAction(action)}` },
                    { text: "Cancel", callback_data: "x:cancel" },
                ],
            ],
        },
    };
}
