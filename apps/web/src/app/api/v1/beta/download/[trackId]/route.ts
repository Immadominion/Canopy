import { NextResponse } from "next/server";

import { isValidUuid } from "@canopy/utils";

import { apiError, notFound } from "@/lib/api/errors";
import { getSessionWallet } from "@/lib/auth/session";
import { fetchApkFromR2 } from "@/lib/r2/client";
import { validateSignedDownloadUrl } from "@/lib/r2/signed-url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RouteParams {
    params: Promise<{ trackId: string }>;
}

/**
 * GET /api/v1/beta/download/[trackId]?p=...&sig=...
 *
 * Validates the wallet-bound HMAC signature, then streams the APK from R2.
 * The R2 object key is resolved server-side from the track record — never
 * provided by the client.
 *
 * The signed URL embeds a walletHash, but possessing the URL is NOT sufficient:
 * the caller must also be signed in AS that wallet. This makes the URL
 * non-transferable — a forwarded/leaked link is useless without that wallet's
 * session. Web sends the httpOnly cookie automatically; the native app sends its
 * Bearer token (see apps/tester/src/lib/verify.ts).
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return notFound();

    const url = new URL(request.url);
    const payloadB64 = url.searchParams.get("p");
    const signature = url.searchParams.get("sig");

    if (!payloadB64 || !signature) return notFound();

    let payload;
    try {
        payload = validateSignedDownloadUrl({
            payloadB64,
            signature,
            expectedTrackId: trackId,
        });
    } catch (err) {
        const code = err instanceof Error ? err.message : "INVALID_URL";
        if (code === "URL_EXPIRED") {
            return apiError("URL_EXPIRED", "Download URL has expired", 410);
        }
        // Any other failure (bad sig, payload tamper, mismatch) -> 404
        return notFound();
    }

    // Bind the download to the signed-in wallet: the URL is wallet-scoped, not a
    // bearer token. The caller must hold a session for the SAME wallet the URL
    // was issued to, so a leaked/forwarded URL can't be redeemed by anyone else.
    const session = await getSessionWallet();
    if (!session || session.walletHash !== payload.walletHash) {
        return notFound();
    }

    const admin = createSupabaseAdminClient();
    const { data: track, error } = await admin
        .from("beta_tracks")
        .select("id, status, r2_key, apk_sha256, apk_size_bytes, expires_at, apk_deleted_at, is_demo")
        .eq("id", trackId)
        .maybeSingle();

    if (error || !track) return notFound();
    if (track.status !== "active") return notFound();
    if (new Date(track.expires_at).getTime() < Date.now()) return notFound();
    // Defense-in-depth: never attempt to serve a purged binary (status should
    // already preclude this, but the R2 object may be gone).
    if (track.apk_deleted_at) return notFound();

    // Re-verify that the wallet on the signed URL is STILL on the allowlist
    // (could have been revoked between URL issuance and download). Demo builds
    // are public, so the allowlist re-check is skipped for them.
    if (!track.is_demo) {
        const { data: tester } = await admin
            .from("beta_testers")
            .select("id")
            .eq("track_id", track.id)
            .eq("wallet_hash", payload.walletHash)
            .maybeSingle();

        if (!tester) return notFound();
    }

    let stream;
    try {
        stream = await fetchApkFromR2(track.r2_key);
    } catch {
        return apiError("STORAGE_ERROR", "Failed to fetch APK", 502);
    }

    // Record the download (best-effort)
    await admin.from("install_events").insert({
        track_id: track.id,
        wallet_hash: payload.walletHash,
        action: "download_started",
    });

    const headers = new Headers();
    headers.set(
        "Content-Type",
        stream.contentType ?? "application/vnd.android.package-archive",
    );
    if (typeof stream.contentLength === "number") {
        headers.set("Content-Length", stream.contentLength.toString());
    }
    headers.set("Content-Disposition", `attachment; filename="${track.apk_sha256}.apk"`);
    headers.set("X-APK-SHA256", track.apk_sha256);
    headers.set("Cache-Control", "private, no-store");

    return new NextResponse(stream.body, { status: 200, headers });
}
