import { confirmKeyboard } from "@/lib/telegram/client";
import { ago, b, code, shortHash, statusBadge } from "@/lib/telegram/format";
import type { Reply } from "@/lib/telegram/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface PublisherRow {
    id: string;
    wallet_hash: string;
    display_name: string | null;
    plan: string;
    verification_status: string;
    created_at: string;
}

const PUB_COLS = "id, wallet_hash, display_name, plan, verification_status, created_at";

/**
 * Resolve a publisher from a flexible identifier:
 *  - 64-hex   -> wallet_hash
 *  - base58   -> wallet_address (exact)
 *  - else     -> treated as an access-request CODE -> publisher_id
 */
async function resolvePublisher(admin: AdminClient, raw: string): Promise<PublisherRow | null> {
    const id = raw.trim();

    if (/^[0-9a-f]{64}$/i.test(id)) {
        const { data } = await admin
            .from("publishers")
            .select(PUB_COLS)
            .eq("wallet_hash", id.toLowerCase())
            .maybeSingle();
        return (data as PublisherRow | null) ?? null;
    }

    const { data: byAddr } = await admin
        .from("publishers")
        .select(PUB_COLS)
        .eq("wallet_address", id)
        .maybeSingle();
    if (byAddr) return byAddr as PublisherRow;

    const { data: ar } = await admin
        .from("access_requests")
        .select("publisher_id")
        .eq("code", id.toUpperCase())
        .maybeSingle();
    if (ar) {
        const { data } = await admin
            .from("publishers")
            .select(PUB_COLS)
            .eq("id", ar.publisher_id)
            .maybeSingle();
        return (data as PublisherRow | null) ?? null;
    }

    return null;
}

/** /publisher <wallet|hash|CODE> — profile + app/track/tester counts. */
export async function publisher(args: string[]): Promise<Reply> {
    const idf = args[0];
    if (!idf) return { text: "Usage: /publisher &lt;wallet|hash|CODE&gt;" };

    const admin = createSupabaseAdminClient();
    const p = await resolvePublisher(admin, idf);
    if (!p) return { text: `No publisher found for ${code(idf)}.` };

    const [apps, tracks, testers] = await Promise.all([
        admin.from("apps").select("id", { count: "exact", head: true }).eq("publisher_id", p.id),
        admin.from("beta_tracks").select("id", { count: "exact", head: true }).eq("publisher_id", p.id),
        admin
            .from("beta_testers")
            .select("id", { count: "exact", head: true })
            .eq("added_by_publisher_id", p.id),
    ]);

    const lines = [
        `${b(p.display_name ?? "Publisher")} — ${statusBadge(p.verification_status)}`,
        `Wallet: ${code(shortHash(p.wallet_hash))}`,
        `Plan: ${b(p.plan)} · Joined ${ago(p.created_at)}`,
        `Apps: ${b(apps.count ?? 0)} · Tracks: ${b(tracks.count ?? 0)} · Testers: ${b(testers.count ?? 0)}`,
    ];

    const hint =
        p.verification_status === "banned"
            ? "Restore with /unban"
            : "Block with /ban";
    lines.push("", hint + " · address-or-hash works too.");

    return { text: lines.join("\n") };
}

/** /ban <wallet|hash|CODE> — confirm, then block the publisher. */
export async function ban(args: string[]): Promise<Reply> {
    const idf = args[0];
    if (!idf) return { text: "Usage: /ban &lt;wallet|hash|CODE&gt;" };

    const admin = createSupabaseAdminClient();
    const p = await resolvePublisher(admin, idf);
    if (!p) return { text: `No publisher found for ${code(idf)}.` };

    const who = p.display_name ?? shortHash(p.wallet_hash);
    if (p.verification_status === "banned") return { text: `${b(who)} is already banned.` };

    return {
        text:
            `Ban ${b(who)}?\nThey lose publisher access and any pending request is closed. ` +
            `Existing tracks still age out under the 30-day cap (use /revoke for an immediate kill).`,
        replyMarkup: confirmKeyboard(`pub:bn:${p.id}`, "Confirm ban"),
    };
}

/** /unban <wallet|hash|CODE> — confirm, then restore to 'unverified'. */
export async function unban(args: string[]): Promise<Reply> {
    const idf = args[0];
    if (!idf) return { text: "Usage: /unban &lt;wallet|hash|CODE&gt;" };

    const admin = createSupabaseAdminClient();
    const p = await resolvePublisher(admin, idf);
    if (!p) return { text: `No publisher found for ${code(idf)}.` };

    const who = p.display_name ?? shortHash(p.wallet_hash);
    if (p.verification_status !== "banned") return { text: `${b(who)} is not banned.` };

    return {
        text: `Unban ${b(who)}? They return to 'unverified' and can request access again.`,
        replyMarkup: confirmKeyboard(`pub:ub:${p.id}`, "Confirm unban"),
    };
}
