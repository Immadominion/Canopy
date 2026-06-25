import crypto from "crypto";

import { NextResponse, after } from "next/server";
import { z } from "zod";

import { generateTrackExpiry, isValidApkSha256 } from "@canopy/utils";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { parseApkManifest } from "@/lib/apk/manifest";
import { writeTrackCreatedRecord } from "@/lib/arweave/irys";
import { logger } from "@/lib/logger";
import { claimAndScanTrack } from "@/lib/malware/run-track-scan";
import {
    buildApkKey,
    copyApkInR2,
    deleteApkFromR2,
    downloadApkFromR2,
    statApkInR2,
} from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const log = logger.child({ route: "POST /api/v1/beta/upload/finalize" });

export const runtime = "nodejs";
// Pulling the APK back from R2 + hashing can take a moment for large builds.
export const maxDuration = 60;

const MAX_APK_BYTES = 200 * 1024 * 1024; // 200 MB hard cap

const bodySchema = z.object({
    appId: z.string().uuid(),
    // The publisher-scoped staging key returned by /api/v1/beta/upload/initiate,
    // where the browser has already PUT the APK directly to R2.
    uploadKey: z.string().min(1).max(256),
    // Optional: auto-detected from the APK manifest when omitted.
    versionName: z.string().min(1).max(64).optional(),
    versionCode: z.coerce.number().int().positive().optional(),
    expiresInDays: z.coerce.number().int().positive().max(30).default(30),
    releaseNotes: z.string().max(2000).optional(),
});

/**
 * POST /api/v1/beta/upload/finalize
 *
 * Step 3 of the upload flow. The browser has already uploaded the APK directly
 * to R2 at `uploadKey` (via the presigned URL from /upload/initiate). This pulls
 * the object back from R2 — NOT through the request body, so the platform's
 * ~4.5MB body limit never applies — validates it, and creates the track.
 *
 * Enforces:
 *   - Invariant 1: publisher must be KYC-verified
 *   - Invariant 3: expires_at always set, clamped to 30 days
 *   - Track is created with status=pending_scan (malware scan happens async)
 */
export async function POST(request: Request): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") {
        return apiError("UNAUTHENTICATED", "Sign in with Solana to continue", 401);
    }
    if (auth.status === "not_publisher") {
        return apiError("NOT_A_PUBLISHER", "Wallet has no publisher record", 403);
    }
    if (auth.status === "kyc_required") {
        return apiError(
            "KYC_REQUIRED",
            "Complete KYC/KYB verification on the dApp Store Publisher Portal first",
            403,
        );
    }
    const { publisher } = auth;

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }
    const metaParsed = bodySchema.safeParse(raw);
    if (!metaParsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid metadata", 400, {
            fields: metaParsed.error.flatten().fieldErrors,
        });
    }
    const meta = metaParsed.data;

    // The upload key MUST live under this publisher's staging prefix — so a
    // publisher can only finalize an object they themselves uploaded.
    const stagingPrefix = `staging/${publisher.id}/`;
    if (!meta.uploadKey.startsWith(stagingPrefix) || meta.uploadKey.includes("..")) {
        return apiError("INVALID_UPLOAD_KEY", "Upload key is not valid for this publisher", 400);
    }
    const cleanupStaging = () => {
        after(() => deleteApkFromR2(meta.uploadKey).catch(() => undefined));
    };

    const admin = createSupabaseAdminClient();

    // Verify the app belongs to this publisher.
    const { data: app, error: appError } = await admin
        .from("apps")
        .select("id, publisher_id")
        .eq("id", meta.appId)
        .maybeSingle();
    if (appError || !app || app.publisher_id !== publisher.id) {
        // Don't reveal whether the app exists — 404 either way (Invariant 5).
        return apiError("NOT_FOUND", "App not found", 404);
    }

    // Check the uploaded object exists and is within the size cap BEFORE pulling
    // it into memory, so an oversize upload can't OOM the function.
    const stat = await statApkInR2(meta.uploadKey);
    if (!stat) {
        return apiError("UPLOAD_NOT_FOUND", "No uploaded file found — re-upload the build", 404);
    }
    if (stat.size === 0) {
        cleanupStaging();
        return apiError("APK_EMPTY", "Uploaded APK is empty", 400);
    }
    if (stat.size > MAX_APK_BYTES) {
        cleanupStaging();
        return apiError(
            "APK_TOO_LARGE",
            `APK exceeds the ${(MAX_APK_BYTES / (1024 * 1024)).toString()} MB limit`,
            413,
        );
    }

    let apkBuffer: Buffer;
    try {
        apkBuffer = await downloadApkFromR2(meta.uploadKey);
    } catch (err) {
        log.error({ err, uploadKey: meta.uploadKey }, "Failed to read uploaded APK from R2");
        return apiError("STORAGE_ERROR", "Failed to read the uploaded APK", 502);
    }

    // ── APK validation ────────────────────────────────────────────────────────
    // ZIP magic bytes — APK files are ZIP archives (PK\x03\x04 header).
    if (
        apkBuffer.length < 4 ||
        apkBuffer[0] !== 0x50 || // P
        apkBuffer[1] !== 0x4b || // K
        apkBuffer[2] !== 0x03 ||
        apkBuffer[3] !== 0x04
    ) {
        cleanupStaging();
        return apiError("INVALID_APK", "File does not appear to be a valid APK (ZIP format expected)", 400);
    }

    // Resolve version from the APK manifest; the dev's explicit values win.
    const detected = parseApkManifest(apkBuffer);
    const versionName = meta.versionName ?? detected?.versionName ?? null;
    const versionCode = meta.versionCode ?? detected?.versionCode ?? null;
    if (!versionName || versionCode === null) {
        return apiError(
            "VERSION_UNDETECTED",
            "Couldn't read the version from this APK — enter versionName and versionCode manually.",
            400,
            {
                detected: {
                    versionName: detected?.versionName ?? null,
                    versionCode: detected?.versionCode ?? null,
                    packageName: detected?.packageName ?? null,
                },
            },
        );
    }

    const apkSha256 = crypto.createHash("sha256").update(apkBuffer).digest("hex");
    if (!isValidApkSha256(apkSha256)) {
        return apiError("INTERNAL_ERROR", "Failed to hash APK", 500);
    }

    // Duplicate SHA-256: same binary cannot create another non-expired track.
    const { data: existingTrack } = await admin
        .from("beta_tracks")
        .select("id")
        .eq("app_id", meta.appId)
        .eq("apk_sha256", apkSha256)
        .not("status", "in", '("expired","revoked","scan_failed")')
        .maybeSingle();
    if (existingTrack) {
        cleanupStaging();
        return apiError(
            "DUPLICATE_BUILD",
            "An active or pending track already exists for this APK binary. Upload a new build to create a new track.",
            409,
        );
    }

    const trackId = crypto.randomUUID();
    const r2Key = buildApkKey({ publisherId: publisher.id, trackId, sha256: apkSha256 });

    // Move the validated object from staging to its canonical key (server-side R2
    // copy — no bytes flow through the function); the staging copy is deleted below.
    try {
        await copyApkInR2({
            fromKey: meta.uploadKey,
            toKey: r2Key,
            contentType: "application/vnd.android.package-archive",
        });
    } catch (err) {
        log.error({ err, trackId }, "R2 copy (staging -> final) failed");
        return apiError("STORAGE_ERROR", "Failed to store APK", 502);
    }

    const expiresAt = generateTrackExpiry(new Date(), meta.expiresInDays);

    const { data: track, error: insertError } = await admin
        .from("beta_tracks")
        .insert({
            id: trackId,
            app_id: meta.appId,
            publisher_id: publisher.id,
            version_name: versionName,
            version_code: versionCode,
            r2_key: r2Key,
            apk_sha256: apkSha256,
            apk_size_bytes: stat.size,
            status: "pending_scan",
            release_notes: meta.releaseNotes ?? null,
            expires_at: expiresAt.toISOString(),
        })
        .select("id, status, expires_at, apk_sha256, apk_size_bytes, version_name, version_code")
        .single();

    if (insertError || !track) {
        // Roll back the canonical copy we just made; staging is cleaned up too.
        after(() => deleteApkFromR2(r2Key).catch(() => undefined));
        cleanupStaging();
        return apiError("DB_ERROR", "Failed to create beta track", 500);
    }

    log.info(
        { trackId: track.id, publisherId: publisher.id, apkSha256 },
        "Beta track created",
    );

    // The canonical copy now exists — drop the staging object.
    cleanupStaging();

    // Run the malware scan after the response — call the scan logic DIRECTLY (no
    // fragile self-HTTP-fetch that could silently fail and leave the APK never
    // submitted to VirusTotal). Hand over the APK buffer we already have so VT
    // submission doesn't re-download from R2. claimAndScanTrack atomically claims
    // the track, submits to VirusTotal, and settles the status; if VT isn't done
    // within the function budget, the build page's poller / recheck cron settles
    // it once the analysis completes.
    after(() => claimAndScanTrack(admin, track.id, { apkBytes: apkBuffer }));

    // Arweave provenance fingerprint (non-fatal).
    after(async () => {
        try {
            const txId = await writeTrackCreatedRecord({
                trackId: track.id,
                apkSha256: track.apk_sha256,
                publisherWalletHash: auth.walletHash,
                expiresAt: track.expires_at,
            });
            await admin.from("beta_tracks").update({ arweave_tx_id: txId }).eq("id", track.id);
        } catch (err) {
            log.error({ err, trackId: track.id }, "Failed to write Arweave fingerprint");
        }
    });

    return NextResponse.json(
        {
            trackId: track.id,
            status: track.status,
            expiresAt: track.expires_at,
            apkSha256: track.apk_sha256,
            apkSizeBytes: track.apk_size_bytes,
            versionName: track.version_name,
            versionCode: track.version_code,
        },
        { status: 201 },
    );
}
