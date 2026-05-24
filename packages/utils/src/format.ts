const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Formats a date as a relative time string.
 * Examples: "just now", "5m ago", "2h ago", "3d ago", "Dec 12"
 */
export function formatRelativeTime(date: Date, relativeTo = new Date()): string {
    const delta = relativeTo.getTime() - date.getTime();

    if (delta < 30 * SECOND) return "just now";
    if (delta < MINUTE) return `${String(Math.floor(delta / SECOND))}s ago`;
    if (delta < HOUR) return `${String(Math.floor(delta / MINUTE))}m ago`;
    if (delta < DAY) return `${String(Math.floor(delta / HOUR))}h ago`;
    if (delta < 7 * DAY) return `${String(Math.floor(delta / DAY))}d ago`;

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
