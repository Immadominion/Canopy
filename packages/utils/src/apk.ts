const UNITS = ["B", "KB", "MB", "GB"] as const;

/** Human-readable APK size: "45.2 MB" */
export function formatApkSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const safeIndex = Math.min(i, UNITS.length - 1);
    const value = bytes / Math.pow(1024, safeIndex);
    const unit = UNITS[safeIndex];
    return `${value.toFixed(1)} ${String(unit)}`;
}

/** Validates that a string is a 64-char lowercase hex SHA-256 */
export function isValidApkSha256(hash: string): boolean {
    return /^[0-9a-f]{64}$/.test(hash);
}
