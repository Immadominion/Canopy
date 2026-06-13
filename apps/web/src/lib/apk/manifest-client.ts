/**
 * Browser-side APK manifest reader — mirrors lib/apk/manifest.ts but runs in the
 * browser so the upload form can PRE-FILL versionName/versionCode the moment a
 * file is selected (before upload). Uses the native DecompressionStream for the
 * deflated AndroidManifest.xml instead of Node's zlib.
 *
 * Best-effort: any failure returns null (or null fields) → the form leaves the
 * fields blank and the server re-detects on upload. Never throws.
 */

export interface ApkManifestInfo {
    versionName: string | null;
    versionCode: number | null;
    packageName: string | null;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
    if (typeof DecompressionStream === "undefined") return null;
    try {
        // Copy into a fresh ArrayBuffer-backed array (a subarray view is typed
        // as ArrayBufferLike, which the Blob/BlobPart types reject).
        const buf = new Uint8Array(data.length);
        buf.set(data);
        const ds = new DecompressionStream("deflate-raw");
        const res = new Response(new Blob([buf]).stream().pipeThrough(ds));
        return new Uint8Array(await res.arrayBuffer());
    } catch {
        return null;
    }
}

async function extractAndroidManifest(apk: Uint8Array): Promise<Uint8Array | null> {
    if (apk.length < 22) return null;
    const dv = new DataView(apk.buffer, apk.byteOffset, apk.byteLength);
    const decoder = new TextDecoder();

    // End-Of-Central-Directory (scan back; comment ≤ 64KB)
    let eocd = -1;
    const minStart = Math.max(0, apk.length - 22 - 0xffff);
    for (let i = apk.length - 22; i >= minStart; i--) {
        if (dv.getUint32(i, true) === EOCD_SIG) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) return null;

    const cdCount = dv.getUint16(eocd + 10, true);
    const cdOffset = dv.getUint32(eocd + 16, true);

    let p = cdOffset;
    for (let n = 0; n < cdCount; n++) {
        if (p + 46 > apk.length || dv.getUint32(p, true) !== CEN_SIG) return null;
        const method = dv.getUint16(p + 10, true);
        const compSize = dv.getUint32(p + 20, true);
        const nameLen = dv.getUint16(p + 28, true);
        const extraLen = dv.getUint16(p + 30, true);
        const commentLen = dv.getUint16(p + 32, true);
        const localOffset = dv.getUint32(p + 42, true);
        const name = decoder.decode(apk.subarray(p + 46, p + 46 + nameLen));

        if (name === "AndroidManifest.xml") {
            if (localOffset + 30 > apk.length || dv.getUint32(localOffset, true) !== LOC_SIG) {
                return null;
            }
            const lNameLen = dv.getUint16(localOffset + 26, true);
            const lExtraLen = dv.getUint16(localOffset + 28, true);
            const dataStart = localOffset + 30 + lNameLen + lExtraLen;
            const data = apk.subarray(dataStart, dataStart + compSize);
            if (method === 0) return data; // stored
            if (method === 8) return inflateRaw(data); // deflate
            return null;
        }
        p += 46 + nameLen + extraLen + commentLen;
    }
    return null;
}

const RES_STRING_POOL = 0x0001;
const RES_XML_START_ELEMENT = 0x0102;
const UTF8_FLAG = 0x0100;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const NO_ENTRY = 0xffffffff;

function parseStringPool(dv: DataView, bytes: Uint8Array, off: number): string[] {
    const stringCount = dv.getUint32(off + 8, true);
    const flags = dv.getUint32(off + 16, true);
    const stringsStart = dv.getUint32(off + 20, true);
    const isUtf8 = (flags & UTF8_FLAG) !== 0;
    const offsetsBase = off + 28;
    const dataBase = off + stringsStart;
    const utf8 = new TextDecoder("utf-8");
    const utf16 = new TextDecoder("utf-16le");

    const strings: string[] = [];
    for (let i = 0; i < stringCount; i++) {
        try {
            const so = dv.getUint32(offsetsBase + i * 4, true);
            let pos = dataBase + so;
            if (isUtf8) {
                const cl = dv.getUint8(pos);
                pos += cl & 0x80 ? 2 : 1;
                const bl = dv.getUint8(pos);
                let byteLen: number;
                if (bl & 0x80) {
                    byteLen = ((bl & 0x7f) << 8) | dv.getUint8(pos + 1);
                    pos += 2;
                } else {
                    byteLen = bl;
                    pos += 1;
                }
                strings.push(utf8.decode(bytes.subarray(pos, pos + byteLen)));
            } else {
                let len = dv.getUint16(pos, true);
                pos += 2;
                if (len & 0x8000) {
                    len = ((len & 0x7fff) << 16) | dv.getUint16(pos, true);
                    pos += 2;
                }
                strings.push(utf16.decode(bytes.subarray(pos, pos + len * 2)));
            }
        } catch {
            strings.push("");
        }
    }
    return strings;
}

function parseManifestElement(
    dv: DataView,
    off: number,
    strings: string[],
): ApkManifestInfo | null {
    const nameIdx = dv.getUint32(off + 20, true);
    if (strings[nameIdx] !== "manifest") return null;

    const attrStart = dv.getUint16(off + 24, true);
    const attrCount = dv.getUint16(off + 28, true);
    const attrsBase = off + 16 + attrStart;

    const result: ApkManifestInfo = {
        versionName: null,
        versionCode: null,
        packageName: null,
    };

    for (let i = 0; i < attrCount; i++) {
        const base = attrsBase + i * 20;
        if (base + 20 > dv.byteLength) break;
        const nameRef = dv.getUint32(base + 4, true);
        const rawValue = dv.getUint32(base + 8, true);
        const dataType = dv.getUint8(base + 15);
        const data = dv.getUint32(base + 16, true);
        const attrName = strings[nameRef];

        if (attrName === "package") {
            const idx = rawValue !== NO_ENTRY ? rawValue : data;
            result.packageName = strings[idx] ?? null;
        } else if (attrName === "versionName") {
            if (dataType === TYPE_STRING) {
                const idx = rawValue !== NO_ENTRY ? rawValue : data;
                result.versionName = strings[idx] ?? null;
            }
        } else if (attrName === "versionCode") {
            if (dataType === TYPE_INT_DEC || dataType === TYPE_INT_HEX) {
                result.versionCode = data >>> 0;
            }
        }
    }
    return result;
}

/** Parse an APK File in the browser. Never throws; returns null on any failure. */
export async function parseApkManifestClient(file: File): Promise<ApkManifestInfo | null> {
    try {
        const apk = new Uint8Array(await file.arrayBuffer());
        const axml = await extractAndroidManifest(apk);
        if (!axml || axml.length < 8) return null;

        const dv = new DataView(axml.buffer, axml.byteOffset, axml.byteLength);
        let strings: string[] | null = null;
        let off = 8;
        while (off + 8 <= axml.length) {
            const type = dv.getUint16(off, true);
            const size = dv.getUint32(off + 4, true);
            if (size < 8 || off + size > axml.length) break;
            if (type === RES_STRING_POOL && !strings) {
                strings = parseStringPool(dv, axml, off);
            } else if (type === RES_XML_START_ELEMENT && strings) {
                const info = parseManifestElement(dv, off, strings);
                return info ?? null;
            }
            off += size;
        }
        return null;
    } catch {
        return null;
    }
}
