/**
 * Formatting helpers for Telegram HTML messages (parse_mode: "HTML").
 *
 * All user/DB-derived text MUST pass through esc() before interpolation — HTML
 * mode only needs &, <, > escaped, and a complete escape is always possible
 * (unlike legacy Markdown, where an odd metacharacter can 400 the whole send).
 */

export function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bold (input is escaped). */
export function b(s: string | number): string {
    return `<b>${esc(String(s))}</b>`;
}

/** Monospace code span (input is escaped). */
export function code(s: string | number): string {
    return `<code>${esc(String(s))}</code>`;
}

/** Truncate + escape a free-text blurb. */
export function clip(s: string, max = 90): string {
    const t = s.length > max ? `${s.slice(0, max)}…` : s;
    return esc(t);
}

/** Short form of a 64-char hash: 6…4. */
export function shortHash(h: string): string {
    return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

/** "3m ago" / "2h ago" / "5d ago" — coarse relative time. */
export function ago(iso: string | null | undefined): string {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "just now";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

/** "in 4d" / "in 6h" / "expired" — time until a future timestamp. */
export function until(iso: string | null | undefined): string {
    if (!iso) return "—";
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "expired";
    const h = Math.floor(ms / (60 * 60 * 1000));
    if (h < 24) return `in ${h}h`;
    return `in ${Math.floor(h / 24)}d`;
}

/** Bytes → human MB/KB. */
export function mb(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Status → emoji badge for at-a-glance scanning. */
export function statusBadge(status: string): string {
    const map: Record<string, string> = {
        // publishers
        approved: "✅ approved",
        pending: "🕓 pending",
        unverified: "○ unverified",
        rejected: "✕ rejected",
        banned: "🚫 banned",
        // tracks
        active: "🟢 active",
        scan_passed: "🔵 scan-passed",
        pending_scan: "🟡 pending-scan",
        scan_in_progress: "🟡 scanning",
        scan_failed: "🔴 scan-failed",
        expired: "⚪ expired",
        revoked: "⚫ revoked",
    };
    return map[status] ?? esc(status);
}
