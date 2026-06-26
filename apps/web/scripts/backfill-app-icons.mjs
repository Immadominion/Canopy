/**
 * Backfill app launcher icons for apps that predate auto-extraction.
 *
 * New uploads extract + store the icon automatically (see upload/finalize).
 * This one-off populates `apps.icon_key` for EXISTING apps from their latest
 * still-stored build. Apps without an icon already fall back to a monogram, so
 * this is optional — it just shows the real icon sooner.
 *
 * Usage (with PRODUCTION env): from apps/web,
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=... \
 *   node scripts/backfill-app-icons.mjs
 */
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import AppInfoParser from "app-info-parser";

const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
];
for (const k of required) {
    if (!process.env[k]) {
        console.error(`Missing env: ${k}`);
        process.exit(1);
    }
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL.includes("127.0.0.1")) {
    console.error("Refusing to run against local Supabase — point at production.");
    process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});
const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
});
const BUCKET = process.env.R2_BUCKET_NAME;

function sniff(b) {
    if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    if (b.length >= 6 && (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
    return null;
}

const { data: apps, error } = await sb.from("apps").select("id, name").is("icon_key", null);
if (error) {
    console.error("apps query failed:", error.message);
    process.exit(1);
}
console.log(`${apps.length} app(s) without an icon`);

let done = 0, skipped = 0, failed = 0;
for (const app of apps) {
    const { data: tracks } = await sb
        .from("beta_tracks")
        .select("r2_key")
        .eq("app_id", app.id)
        .is("apk_deleted_at", null)
        .not("r2_key", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
    const track = tracks?.[0];
    if (!track?.r2_key) {
        skipped++;
        console.log(`· skip   ${app.name} — no APK still in R2`);
        continue;
    }

    const tmp = join(tmpdir(), `bf-${randomUUID()}.apk`);
    try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: track.r2_key }));
        const bytes = Buffer.from(await obj.Body.transformToByteArray());
        await writeFile(tmp, bytes);
        const r = await new AppInfoParser(tmp).parse();
        const icon = typeof r.icon === "string" ? r.icon.replace(/^data:image\/\w+;base64,/, "") : "";
        const ib = Buffer.from(icon, "base64");
        const mime = sniff(ib);
        if (!mime) {
            failed++;
            console.log(`✗ fail   ${app.name} — no raster icon in APK`);
            continue;
        }
        const iconKey = `icons/${app.id}`;
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: iconKey, Body: ib, ContentType: mime }));
        await sb.from("apps").update({ icon_key: iconKey }).eq("id", app.id);
        done++;
        console.log(`✓ done   ${app.name} — ${ib.length}b ${mime}`);
    } catch (e) {
        failed++;
        console.log(`✗ error  ${app.name} — ${e.message}`);
    } finally {
        await unlink(tmp).catch(() => {});
    }
}
console.log(`\nbackfill complete: done=${done} skipped=${skipped} failed=${failed}`);
