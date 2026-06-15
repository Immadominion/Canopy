import { confirmKeyboard } from "@/lib/telegram/client";
import { b, code } from "@/lib/telegram/format";
import type { CommandCtx, Reply } from "@/lib/telegram/types";
import { env } from "@/lib/env";
import { runHealthChecks } from "@/lib/health/checks";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const STUCK_AFTER_MS = 15 * 60 * 1000;

function dot(status: string): string {
    return status === "operational" ? "🟢" : status === "degraded" ? "🟡" : "🔴";
}

/** /health — component health (DB, ingest) + scan-pipeline backlog. */
export async function health(): Promise<Reply> {
    const admin = createSupabaseAdminClient();
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString();

    const [report, backlog, stuck, failed] = await Promise.all([
        runHealthChecks(),
        admin
            .from("beta_tracks")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending_scan", "scan_in_progress"]),
        admin
            .from("beta_tracks")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending_scan", "scan_in_progress"])
            .lt("updated_at", stuckBefore),
        admin.from("beta_tracks").select("id", { count: "exact", head: true }).eq("status", "scan_failed"),
    ]);

    const lines = [
        `${dot(report.status)} <b>System: ${report.status}</b>`,
        ...report.checks.map((c) => `${dot(c.status)} ${c.name} · ${c.latencyMs}ms`),
        "",
        `Scan backlog: ${b(backlog.count ?? 0)}${(stuck.count ?? 0) > 0 ? ` (⚠️ ${stuck.count ?? 0} stuck >15m)` : ""}`,
        `Scan-failed (lifetime): ${b(failed.count ?? 0)}`,
    ];
    return { text: lines.join("\n") };
}

/** /trigger <job> — confirm, then run a cron job on demand. */
export async function trigger(args: string[]): Promise<Reply> {
    const job = args[0];
    if (job !== "expire-cleanup" && job !== "scan-recheck") {
        return { text: "Usage: /trigger &lt;expire-cleanup|scan-recheck&gt;" };
    }
    const jobCode = job === "expire-cleanup" ? "ec" : "sr";
    const caution =
        job === "scan-recheck" ? "\n⚠️ Uses VirusTotal free-tier quota (4/min, 500/day)." : "";

    return {
        text: `Run <b>${job}</b> now?${caution}`,
        replyMarkup: confirmKeyboard(`op:tr:${jobCode}`, `Run ${job}`),
    };
}

/** /whoami — echo the caller's chat id + admin status (pre-gate, leaks nothing). */
export function whoami(_args: string[], ctx: CommandCtx): Promise<Reply> {
    const isAdmin = String(ctx.fromId ?? ctx.chatId) === String(env.TELEGRAM_ADMIN_CHAT_ID);
    return Promise.resolve({
        text: `Chat id: ${code(String(ctx.chatId))}\nAdmin: ${isAdmin ? "yes ✅" : "no"}`,
    });
}

/** /start — greeting (pre-gate). */
export function start(): Promise<Reply> {
    return Promise.resolve({
        text: "🌳 <b>Canopy admin console</b>\nSend /help for the command list.",
    });
}
