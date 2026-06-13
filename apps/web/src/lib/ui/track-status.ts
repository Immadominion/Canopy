/**
 * Maps a beta-track status to a human label + a `.chip--*` variant class
 * (defined in globals.css), so status pills look consistent across the app.
 */
export function trackStatusChip(status: string): { label: string; cls: string } {
    switch (status) {
        case "active":
            return { label: "Active", cls: "chip--success" };
        case "scan_passed":
            return { label: "Scan passed", cls: "chip--info" };
        case "pending_scan":
            return { label: "Pending scan", cls: "chip--warning" };
        case "scan_in_progress":
            return { label: "Scanning", cls: "chip--warning" };
        case "scan_failed":
            return { label: "Scan failed", cls: "chip--error" };
        case "revoked":
            return { label: "Revoked", cls: "chip--error" };
        case "expired":
            return { label: "Expired", cls: "" };
        default:
            return { label: status.replace(/_/g, " "), cls: "" };
    }
}
