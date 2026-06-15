import { ago, b, clip, code } from "@/lib/telegram/format";
import type { Reply } from "@/lib/telegram/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const DAY_MS = 24 * 60 * 60 * 1000;

function countOf(
    q: PromiseLike<{ count: number | null }>,
): Promise<number> {
    return Promise.resolve(q).then((r) => r.count ?? 0);
}

/** /stats — the founder top-line digest, assembled from parallel count queries. */
export async function stats(): Promise<Reply> {
    const admin = createSupabaseAdminClient();
    const now = Date.now();
    const since24h = new Date(now - DAY_MS).toISOString();
    const since7d = new Date(now - 7 * DAY_MS).toISOString();

    const pubs = (s: "pending" | "approved" | "banned") =>
        admin.from("publishers").select("id", { count: "exact", head: true }).eq("verification_status", s);
    const installs = (since: string) =>
        admin
            .from("install_events")
            .select("id", { count: "exact", head: true })
            .eq("action", "download_started")
            .gte("created_at", since);

    const [
        pubTotal,
        pubPending,
        pubApproved,
        pubBanned,
        appsTotal,
        tracksActive,
        scanQueue,
        testers,
        inst24h,
        inst7d,
        events24h,
        crashesOpen,
    ] = await Promise.all([
        countOf(admin.from("publishers").select("id", { count: "exact", head: true })),
        countOf(pubs("pending")),
        countOf(pubs("approved")),
        countOf(pubs("banned")),
        countOf(admin.from("apps").select("id", { count: "exact", head: true })),
        countOf(admin.from("beta_tracks").select("id", { count: "exact", head: true }).eq("status", "active")),
        countOf(
            admin
                .from("beta_tracks")
                .select("id", { count: "exact", head: true })
                .in("status", ["pending_scan", "scan_in_progress"]),
        ),
        countOf(admin.from("beta_testers").select("id", { count: "exact", head: true })),
        countOf(installs(since24h)),
        countOf(installs(since7d)),
        countOf(admin.from("analytics_events").select("id", { count: "exact", head: true }).gte("timestamp", since24h)),
        countOf(admin.from("crash_reports").select("id", { count: "exact", head: true }).is("resolved_at", null)),
    ]);

    const text = [
        "📊 <b>Canopy — platform stats</b>",
        "",
        `<b>Publishers</b> ${b(pubTotal)} · 🕓 ${pubPending} pending · ✅ ${pubApproved} approved · 🚫 ${pubBanned} banned`,
        `<b>Apps</b> ${b(appsTotal)} · <b>Live tracks</b> ${b(tracksActive)} · <b>Scan queue</b> ${b(scanQueue)}`,
        `<b>Testers</b> ${b(testers)} total`,
        `<b>Installs</b> ${b(inst24h)} (24h) · ${b(inst7d)} (7d)`,
        `<b>Events</b> ${b(events24h)} (24h) · <b>Open crashes</b> ${b(crashesOpen)}`,
        "",
        `<i>Installs = download_started; install_confirmed has no emitter yet.</i>`,
    ].join("\n");

    return { text };
}

async function appNames(admin: AdminClient, ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const { data } = await admin.from("apps").select("id, name").in("id", unique);
    const m = new Map<string, string>();
    for (const a of data ?? []) m.set(a.id, a.name);
    return m;
}

/** /crashes [24h|7d] — most recent unresolved crash groups across all apps. */
export async function crashes(args: string[]): Promise<Reply> {
    const window = args[0] === "7d" ? "7d" : "24h";
    const cutoff = new Date(Date.now() - (window === "7d" ? 7 : 1) * DAY_MS).toISOString();

    const admin = createSupabaseAdminClient();
    const { data } = await admin
        .from("crash_reports")
        .select("id, app_id, error_message, occurrence_count, app_version, last_seen_at")
        .is("resolved_at", null)
        .gte("last_seen_at", cutoff)
        .order("last_seen_at", { ascending: false })
        .limit(10);

    if (!data || data.length === 0) return { text: `✅ No unresolved crashes in the last ${window}.` };

    const names = await appNames(admin, data.map((c) => c.app_id));
    const lines = data.map((c) => {
        const name = names.get(c.app_id) ?? "app";
        const ver = c.app_version ? ` v${c.app_version}` : "";
        return `${b(name)}${ver} ×${c.occurrence_count} · ${ago(c.last_seen_at)}\n${code(clip(c.error_message, 90))}`;
    });

    return { text: `💥 <b>Crashes (${window}) — ${data.length}</b>\n\n${lines.join("\n\n")}` };
}
