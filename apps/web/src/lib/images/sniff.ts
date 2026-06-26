/**
 * Detect a raster image type from its magic bytes. Returns an allowlisted image
 * MIME, or null if the bytes are not a recognized image.
 *
 * Used wherever we serve bytes that originated from user/binary input: we MUST
 * derive the Content-Type from the actual bytes (never a stored/attacker-set
 * content-type) to avoid serving e.g. text/html on a first-party origin.
 */
export function sniffImageMime(b: Buffer): string | null {
    if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
        return "image/png";
    }
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        b.length >= 12 &&
        b.toString("ascii", 0, 4) === "RIFF" &&
        b.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "image/webp";
    }
    if (
        b.length >= 6 &&
        (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a")
    ) {
        return "image/gif";
    }
    return null;
}

/** Response headers that make serving image bytes safe (no MIME sniff, no script). */
export function safeImageHeaders(mime: string): Record<string, string> {
    return {
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
        "Cache-Control": "private, max-age=300",
    };
}
