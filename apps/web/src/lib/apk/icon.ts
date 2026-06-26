import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// app-info-parser has no bundled types; it resolves an APK's launcher icon
// (incl. adaptive icons) to a raster via resources.arsc.
// @ts-expect-error — no type declarations published
import AppInfoParser from "app-info-parser";

import { logger } from "@/lib/logger";
import { sniffImageMime } from "@/lib/images/sniff";

const log = logger.child({ module: "apk-icon" });

/**
 * Extract an app's launcher icon from its APK as raster image bytes.
 *
 * app-info-parser resolves the `<application android:icon>` resource through
 * resources.arsc and returns a base64 raster (validated against real adaptive-
 * icon APKs to come back as PNG, not the adaptive XML). Returns null on any
 * failure or if the result isn't a recognized raster image — callers fall back
 * to a monogram, so a build never fails because its icon couldn't be read.
 */
export async function extractApkIcon(
    apkBuffer: Buffer,
): Promise<{ bytes: Buffer; mime: string } | null> {
    const tmp = join(tmpdir(), `canopy-icon-${randomUUID()}.apk`);
    try {
        await writeFile(tmp, apkBuffer);
        const parser = new AppInfoParser(tmp);
        const result = (await parser.parse()) as { icon?: unknown };
        const icon = result.icon;
        if (typeof icon !== "string" || icon.length === 0) return null;

        const b64 = icon.replace(/^data:image\/\w+;base64,/, "");
        const bytes = Buffer.from(b64, "base64");
        const mime = sniffImageMime(bytes);
        if (!mime) return null; // not a raster (e.g. an unresolved adaptive XML)
        return { bytes, mime };
    } catch (err) {
        log.warn({ err }, "APK icon extraction failed");
        return null;
    } finally {
        await unlink(tmp).catch(() => undefined);
    }
}
