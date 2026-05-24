/**
 * Generates a RFC 4122 v4 UUID using the Web Crypto API.
 * Available in Hermes (React Native 0.73+) via `globalThis.crypto.getRandomValues`.
 */
export function generateId(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);

    // Set version (4) and variant bits — use DataView to avoid noUncheckedIndexedAccess issues
    const view = new DataView(bytes.buffer);
    view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40);
    view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return (
        hex.slice(0, 8) +
        "-" +
        hex.slice(8, 12) +
        "-" +
        hex.slice(12, 16) +
        "-" +
        hex.slice(16, 20) +
        "-" +
        hex.slice(20)
    );
}
