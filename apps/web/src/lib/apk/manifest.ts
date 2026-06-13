import zlib from "node:zlib";

/**
 * Minimal, dependency-free APK manifest reader.
 *
 * Locates `AndroidManifest.xml` inside the APK (a ZIP) and parses the binary
 * "Android Binary XML" (AXML) format to pull the `<manifest>` element's
 * `versionName`, `versionCode`, and `package` attributes — the same values
 * `aapt dump badging` reports, without needing the Android SDK on the server.
 *
 * Best-effort by design: ANY malformed input returns `null` (or null fields) so
 * callers fall back to manual entry rather than failing the upload. It never
 * throws. A `versionName` stored as a resource reference (not a literal string)
 * is reported as `null` since resolving it needs `resources.arsc`.
 */

export interface ApkManifestInfo {
    versionName: string | null;
    versionCode: number | null;
    packageName: string | null;
}

// ── ZIP: find + decompress AndroidManifest.xml ──────────────────────────────
const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function extractAndroidManifest(apk: Buffer): Buffer | null {
    if (apk.length < 22) return null;

    // Find End-Of-Central-Directory record (scan backwards; comment ≤ 64KB).
    let eocd = -1;
    const minStart = Math.max(0, apk.length - 22 - 0xffff);
    for (let i = apk.length - 22; i >= minStart; i--) {
        if (apk.readUInt32LE(i) === EOCD_SIG) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) return null;

    const cdCount = apk.readUInt16LE(eocd + 10);
    const cdOffset = apk.readUInt32LE(eocd + 16);

    let p = cdOffset;
    for (let n = 0; n < cdCount; n++) {
        if (p + 46 > apk.length || apk.readUInt32LE(p) !== CEN_SIG) return null;
        const method = apk.readUInt16LE(p + 10);
        const compSize = apk.readUInt32LE(p + 20);
        const nameLen = apk.readUInt16LE(p + 28);
        const extraLen = apk.readUInt16LE(p + 30);
        const commentLen = apk.readUInt16LE(p + 32);
        const localOffset = apk.readUInt32LE(p + 42);
        const name = apk.toString("utf8", p + 46, p + 46 + nameLen);

        if (name === "AndroidManifest.xml") {
            if (localOffset + 30 > apk.length || apk.readUInt32LE(localOffset) !== LOC_SIG) {
                return null;
            }
            const lNameLen = apk.readUInt16LE(localOffset + 26);
            const lExtraLen = apk.readUInt16LE(localOffset + 28);
            const dataStart = localOffset + 30 + lNameLen + lExtraLen;
            const data = apk.subarray(dataStart, dataStart + compSize);
            if (method === 0) return Buffer.from(data); // stored
            if (method === 8) return zlib.inflateRawSync(data); // deflate
            return null; // unsupported compression
        }
        p += 46 + nameLen + extraLen + commentLen;
    }
    return null;
}

// ── AXML chunk constants ────────────────────────────────────────────────────
const RES_STRING_POOL = 0x0001;
const RES_XML_START_ELEMENT = 0x0102;
const UTF8_FLAG = 0x0100;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const NO_ENTRY = 0xffffffff;

function parseStringPool(buf: Buffer, off: number): string[] {
    const stringCount = buf.readUInt32LE(off + 8);
    const flags = buf.readUInt32LE(off + 16);
    const stringsStart = buf.readUInt32LE(off + 20);
    const isUtf8 = (flags & UTF8_FLAG) !== 0;
    const offsetsBase = off + 28;
    const dataBase = off + stringsStart;

    const strings: string[] = [];
    for (let i = 0; i < stringCount; i++) {
        try {
            const so = buf.readUInt32LE(offsetsBase + i * 4);
            let pos = dataBase + so;
            if (isUtf8) {
                // char-count (skip), then byte-count, then bytes
                const cl = buf.readUInt8(pos);
                pos += cl & 0x80 ? 2 : 1;
                const bl = buf.readUInt8(pos);
                pos += bl & 0x80 ? 2 : 1;
                const byteLen = bl & 0x80 ? ((bl & 0x7f) << 8) | buf.readUInt8(pos - 1) : bl;
                strings.push(buf.toString("utf8", pos, pos + byteLen));
            } else {
                let len = buf.readUInt16LE(pos);
                pos += 2;
                if (len & 0x8000) {
                    len = ((len & 0x7fff) << 16) | buf.readUInt16LE(pos);
                    pos += 2;
                }
                strings.push(buf.toString("utf16le", pos, pos + len * 2));
            }
        } catch {
            strings.push("");
        }
    }
    return strings;
}

function parseManifestElement(
    buf: Buffer,
    off: number,
    strings: string[],
): ApkManifestInfo | null {
    const nameIdx = buf.readUInt32LE(off + 20);
    if (strings[nameIdx] !== "manifest") return null;

    const attrStart = buf.readUInt16LE(off + 24); // offset from attrExt start
    const attrCount = buf.readUInt16LE(off + 28);
    const attrsBase = off + 16 + attrStart;

    const result: ApkManifestInfo = {
        versionName: null,
        versionCode: null,
        packageName: null,
    };

    for (let i = 0; i < attrCount; i++) {
        const base = attrsBase + i * 20;
        if (base + 20 > buf.length) break;
        const nameRef = buf.readUInt32LE(base + 4);
        const rawValue = buf.readUInt32LE(base + 8);
        const dataType = buf.readUInt8(base + 15);
        const data = buf.readUInt32LE(base + 16);
        const attrName = strings[nameRef];

        if (attrName === "package") {
            const idx = rawValue !== NO_ENTRY ? rawValue : data;
            result.packageName = strings[idx] ?? null;
        } else if (attrName === "versionName") {
            if (dataType === TYPE_STRING) {
                const idx = rawValue !== NO_ENTRY ? rawValue : data;
                result.versionName = strings[idx] ?? null;
            }
            // resource-reference versionName → leave null (needs resources.arsc)
        } else if (attrName === "versionCode") {
            if (dataType === TYPE_INT_DEC || dataType === TYPE_INT_HEX) {
                result.versionCode = data >>> 0;
            }
        }
    }
    return result;
}

/**
 * Parse an APK buffer and return its manifest version info. Never throws;
 * returns `null` when the APK/manifest can't be read, and individual fields are
 * `null` when that attribute isn't a readable literal.
 */
export function parseApkManifest(apk: Buffer): ApkManifestInfo | null {
    try {
        const axml = extractAndroidManifest(apk);
        if (!axml || axml.length < 8) return null;

        let strings: string[] | null = null;
        let off = 8; // skip file header (type/headerSize/size)
        while (off + 8 <= axml.length) {
            const type = axml.readUInt16LE(off);
            const size = axml.readUInt32LE(off + 4);
            if (size < 8 || off + size > axml.length) break;

            if (type === RES_STRING_POOL && !strings) {
                strings = parseStringPool(axml, off);
            } else if (type === RES_XML_START_ELEMENT && strings) {
                const info = parseManifestElement(axml, off, strings);
                if (info) return info; // first element is <manifest>
                return null; // first element wasn't <manifest> — bail
            }
            off += size;
        }
        return null;
    } catch {
        return null;
    }
}
