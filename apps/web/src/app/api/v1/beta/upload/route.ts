import crypto from "crypto";

import { NextResponse, after } from "next/server";
import { z } from "zod";

import { generateTrackExpiry, isValidApkSha256 } from "@canopy/utils";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { parseApkManifest } from "@/lib/apk/manifest";
import { writeTrackCreatedRecord } from "@/lib/arweave/irys";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { buildApkKey, uploadApkToR2 } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const log = logger.child({ route: "POST /api/v1/beta/upload" });

export const runtime = "nodejs";
// APK uploads can be tens of MB — allow long-running parsing
export const maxDuration = 60;

const MAX_APK_BYTES = 200 * 1024 * 1024; // 200 MB hard cap

const metadataSchema = z.object({
    appId: z.string().uuid(),
    // Optional: auto-detected from the APK manifest when omitted. The dev only
    // supplies these to override, or when the APK can't be read.
    versionName: z.string().min(1).max(64).optional(),
    versionCode: z.coerce.number().int().positive().optional(),
    expiresInDays: z.coerce.number().int().positive().max(30).default(30),
    releaseNotes: z.string().max(2000).optional(),
});

/**
 * POST /api/v1/beta/upload
 *
 * multipart/form-data fields:
 *   - apk           (binary, application/vnd.android.package-archive)
 *   - appId         (uuid)
 *   - versionName   (string)
 *   - versionCode   (positive int)
 *   - expiresInDays (1..30, default 30)
 *   - releaseNotes  (optional, ≤ 2000)
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

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return apiError("INVALID_BODY", "Expected multipart/form-data", 400);
    }

    const apkEntry = form.get("apk");
    if (!(apkEntry instanceof File)) {
        return apiError("APK_MISSING", "Field 'apk' must be a file", 400);
    }
    if (apkEntry.size === 0) {
        return apiError("APK_EMPTY", "APK file is empty", 400);
    }
    if (apkEntry.size > MAX_APK_BYTES) {
        return apiError(
            "APK_TOO_LARGE",
            `APK exceeds the ${(MAX_APK_BYTES / (1024 * 1024)).toString()} MB limit`,
            413,
        );
    }

    const metaParsed = metadataSchema.safeParse({
        appId: form.get("appId"),
        // Treat blank/absent version fields as "auto-detect" (undefined).
        versionName: form.get("versionName") || undefined,
        versionCode: form.get("versionCode") || undefined,
        expiresInDays: form.get("expiresInDays") ?? undefined,
        releaseNotes: form.get("releaseNotes") ?? undefined,
    });
    if (!metaParsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid metadata", 400, {
            fields: metaParsed.error.flatten().fieldErrors,
        });
    }
    const meta = metaParsed.data;

    const admin = createSupabaseAdminClient();

    // Verify the app belongs to this publisher
    const { data: app, error: appError } = await admin
        .from("apps")
        .select("id, publisher_id")
        .eq("id", meta.appId)
        .maybeSingle();

    if (appError || !app || app.publisher_id !== publisher.id) {
        // Don't reveal whether the app exists — 404 either way (Invariant 5).
        return apiError("NOT_FOUND", "App not found", 404);
    }

    // Buffer APK and compute SHA-256 (uploads are bounded to MAX_APK_BYTES)
    const apkBuffer = Buffer.from(await apkEntry.arrayBuffer());

    // ── APK validation ────────────────────────────────────────────────────────
    // 1. ZIP magic bytes — APK files are ZIP archives (PK\x03\x04 header).
    if (
        apkBuffer.length < 4 ||
        apkBuffer[0] !== 0x50 || // P
        apkBuffer[1] !== 0x4b || // K
        apkBuffer[2] !== 0x03 ||
        apkBuffer[3] !== 0x04
    ) {
        return apiError("INVALID_APK", "File does not appear to be a valid APK (ZIP format expected)", 400);
    }

    // ── Resolve version from the APK manifest (auto-detect) ─────────────────────
    // Read versionName/versionCode straight from the APK. The dev's submitted
    // values (if any) win — they're an explicit override; otherwise we use what
    // the APK declares. Only when neither source has a value do we ask them to
    // enter it manually.
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

    // 2. Duplicate SHA-256 check: same binary cannot create another non-expired track
    //    for the same app. A new build means a new binary — Invariant 3.
    const { data: existingTrack } = await admin
        .from("beta_tracks")
        .select("id, status")
        .eq("app_id", meta.appId)
        .eq("apk_sha256", apkSha256)
        .not("status", "in", '("expired","revoked","scan_failed")')
        .maybeSingle();

    if (existingTrack) {
        return apiError(
            "DUPLICATE_BUILD",
            "An active or pending track already exists for this APK binary. Upload a new build to create a new track.",
            409,
        );
    }

    // Pre-allocate a UUID for the track so the R2 key is final before insert
    const trackId = crypto.randomUUID();
    const r2Key = buildApkKey({
        publisherId: publisher.id,
        trackId,
        sha256: apkSha256,
    });

    log.info(
        { publisherId: publisher.id, appId: meta.appId, trackId, apkSizeBytes: apkEntry.size },
        "Uploading APK to R2",
    );

    try {
        await uploadApkToR2({
            key: r2Key,
            body: apkBuffer,
            contentType: "application/vnd.android.package-archive",
        });
    } catch (err) {
        log.error({ err, trackId }, "R2 upload failed");
        return apiError("STORAGE_ERROR", "Failed to upload APK to storage", 502);
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
            apk_size_bytes: apkEntry.size,
            status: "pending_scan",
            release_notes: meta.releaseNotes ?? null,
            expires_at: expiresAt.toISOString(),
        })
        .select("id, status, expires_at, apk_sha256, apk_size_bytes, version_name, version_code")
        .single();

    if (insertError || !track) {
        // Best-effort: orphaned APK will be cleaned up by the R2 lifecycle policy.
        return apiError("DB_ERROR", "Failed to create beta track", 500);
    }

    log.info(
        { trackId: track.id, publisherId: publisher.id, apkSha256 },
        "Beta track created",
    );

    // Trigger the malware scan after the response is sent. `after()` guarantees
    // the dispatch actually runs — an un-awaited `void fetch()` in a route handler
    // is NOT guaranteed to fire once the response returns (the request scope is
    // torn down), which left tracks stuck at `pending_scan`. The scan endpoint
    // fast-ACKs (transition → scan_in_progress) and does the slow VirusTotal work
    // in its own `after()`, so this await resolves quickly.
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    after(async () => {
        try {
            await fetch(`${appUrl}/api/v1/beta/${track.id}/scan`, { method: "POST" });
        } catch (err: unknown) {
            log.error({ err, trackId: track.id }, "Failed to trigger malware scan");
        }
    });

    // Fire-and-forget Arweave fingerprint — must not block the response (§11)
    void writeTrackCreatedRecord({
        trackId: track.id,
        apkSha256: track.apk_sha256,
        publisherWalletHash: auth.walletHash,
        expiresAt: track.expires_at,
    })
        .then((txId) => {
            void admin
                .from("beta_tracks")
                .update({ arweave_tx_id: txId })
                .eq("id", track.id);
        })
        .catch(() => {
            // Arweave write failures are non-fatal — track exists without a TX ID
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
