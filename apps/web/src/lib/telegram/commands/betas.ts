import { isValidUuid } from "@canopy/utils";

import { confirmKeyboard } from "@/lib/telegram/client";
import { ago, b, code, esc, mb, statusBadge, until } from "@/lib/telegram/format";
import type { Reply } from "@/lib/telegram/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const STUCK_AFTER_MS = 15 * 60 * 1000;

/** Resolve app_id -> name for a set of tracks in one query. */
async function appNames(admin: AdminClient, ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const { data } = await admin.from("apps").select("id, name").in("id", unique);
    const m = new Map<string, string>();
    for (const a of data ?? []) m.set(a.id, a.name);
    return m;
}

/** /tracks — live betas (active + awaiting activation), newest first. */
export async function tracks(): Promise<Reply> {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
        .from("beta_tracks")
        .select("id, app_id, version_name, status, tester_count, tester_cap, expires_at")
        .in("status", ["active", "scan_passed"])
        .order("created_at", { ascending: false })
        .limit(12);

    if (!data || data.length === 0) return { text: "No active tracks right now." };

    const names = await appNames(admin, data.map((t) => t.app_id));
    const lines = data.map((t) => {
        const name = names.get(t.app_id) ?? "app";
        return (
            `${b(name)} v${esc(t.version_name)} — ${statusBadge(t.status)}\n` +
            `${t.tester_count}/${t.tester_cap} testers · expires ${until(t.expires_at)}\n${code(t.id)}`
        );
    });

    return {
        text: `🟢 <b>Live tracks (${data.length})</b>\n\n${lines.join("\n\n")}\n\nDetail: /track &lt;id&gt;`,
    };
}

/** /track <id> — full detail of one track. */
export async function track(args: string[]): Promise<Reply> {
    const id = args[0];
    if (!id || !isValidUuid(id)) return { text: "Usage: /track &lt;track-uuid&gt;" };

    const admin = createSupabaseAdminClient();
    const { data: t } = await admin
        .from("beta_tracks")
        .select(
            "id, app_id, version_name, version_code, status, tester_count, tester_cap, apk_sha256, apk_size_bytes, expires_at, created_at, apk_deleted_at",
        )
        .eq("id", id)
        .maybeSingle();

    if (!t) return { text: "Track not found." };

    const names = await appNames(admin, [t.app_id]);
    const lines = [
        `${b(names.get(t.app_id) ?? "app")} v${esc(t.version_name)} (code ${t.version_code})`,
        `Status: ${statusBadge(t.status)}`,
        `Testers: ${b(`${t.tester_count}/${t.tester_cap}`)}`,
        `APK: ${mb(t.apk_size_bytes)} · ${code(t.apk_sha256.slice(0, 16))}${t.apk_deleted_at ? " · purged" : ""}`,
        `Created ${ago(t.created_at)} · expires ${until(t.expires_at)}`,
        "",
        `Manage: /revoke ${t.id} · /extend ${t.id} &lt;days&gt;`,
    ];
    return { text: lines.join("\n") };
}

/** /scanqueue — scan-pipeline health: counts by status + stuck builds. */
export async function scanqueue(): Promise<Reply> {
    const admin = createSupabaseAdminClient();
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString();

    const [pendingScan, inProgress, passed, failed, stuck] = await Promise.all([
        admin.from("beta_tracks").select("id", { count: "exact", head: true }).eq("status", "pending_scan"),
        admin.from("beta_tracks").select("id", { count: "exact", head: true }).eq("status", "scan_in_progress"),
        admin.from("beta_tracks").select("id", { count: "exact", head: true }).eq("status", "scan_passed"),
        admin.from("beta_tracks").select("id", { count: "exact", head: true }).eq("status", "scan_failed"),
        admin
            .from("beta_tracks")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending_scan", "scan_in_progress"])
            .lt("updated_at", stuckBefore),
    ]);

    const lines = [
        "🔬 <b>Scan queue</b>",
        `Pending: ${b(pendingScan.count ?? 0)} · Scanning: ${b(inProgress.count ?? 0)}`,
        `Passed (awaiting activation): ${b(passed.count ?? 0)}`,
        `Failed: ${b(failed.count ?? 0)}`,
        `⚠️ Stuck >15m: ${b(stuck.count ?? 0)}`,
    ];
    if ((stuck.count ?? 0) > 0) lines.push("", "Nudge with /trigger scan-recheck");
    return { text: lines.join("\n") };
}

/** /expiring [days] — active tracks expiring within N days (default 7). */
export async function expiring(args: string[]): Promise<Reply> {
    const days = Math.min(30, Math.max(1, Number.parseInt(args[0] ?? "7", 10) || 7));
    const admin = createSupabaseAdminClient();
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await admin
        .from("beta_tracks")
        .select("id, app_id, version_name, expires_at")
        .eq("status", "active")
        .lt("expires_at", cutoff)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true })
        .limit(15);

    if (!data || data.length === 0) return { text: `No active tracks expiring within ${days}d.` };

    const names = await appNames(admin, data.map((t) => t.app_id));
    const lines = data.map(
        (t) => `${b(names.get(t.app_id) ?? "app")} v${esc(t.version_name)} — expires ${until(t.expires_at)}\n${code(t.id)}`,
    );
    return { text: `⏳ <b>Expiring within ${days}d (${data.length})</b>\n\n${lines.join("\n\n")}` };
}

/** /revoke <id> — confirm, then kill the track + purge its APK. */
export async function revoke(args: string[]): Promise<Reply> {
    const id = args[0];
    if (!id || !isValidUuid(id)) return { text: "Usage: /revoke &lt;track-uuid&gt;" };

    const admin = createSupabaseAdminClient();
    const { data: t } = await admin
        .from("beta_tracks")
        .select("id, app_id, version_name, status")
        .eq("id", id)
        .maybeSingle();

    if (!t) return { text: "Track not found." };
    if (t.status === "revoked") return { text: "Track is already revoked." };
    if (t.status === "expired") return { text: "Track is already expired." };

    const names = await appNames(admin, [t.app_id]);
    return {
        text: `Revoke ${b(names.get(t.app_id) ?? "app")} v${esc(t.version_name)}? This is terminal and purges the APK from R2.`,
        replyMarkup: confirmKeyboard(`bt:rv:${t.id}`, "Confirm revoke"),
    };
}

/** /extend <id> <days> — confirm, then push expiry out (≤30-day hard cap). */
export async function extend(args: string[]): Promise<Reply> {
    const id = args[0];
    const days = Number.parseInt(args[1] ?? "", 10);
    if (!id || !isValidUuid(id) || !Number.isFinite(days) || days < 1 || days > 30) {
        return { text: "Usage: /extend &lt;track-uuid&gt; &lt;days 1-30&gt;" };
    }

    const admin = createSupabaseAdminClient();
    const { data: t } = await admin
        .from("beta_tracks")
        .select("id, app_id, version_name, status, expires_at")
        .eq("id", id)
        .maybeSingle();

    if (!t) return { text: "Track not found." };
    if (t.status === "revoked" || t.status === "expired") {
        return { text: `Cannot extend a ${t.status} track.` };
    }
    if (new Date(t.expires_at).getTime() < Date.now()) return { text: "Track has already expired." };

    const names = await appNames(admin, [t.app_id]);
    return {
        text: `Extend ${b(names.get(t.app_id) ?? "app")} v${esc(t.version_name)} by ${b(days)}d? (capped at 30d from creation)`,
        replyMarkup: confirmKeyboard(`bt:ex:${t.id}:${days}`, `Confirm +${days}d`),
    };
}
