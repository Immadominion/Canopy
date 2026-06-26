import { NextResponse } from "next/server";

import { getSessionWallet } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Tester-facing lifecycle status (a strict subset of beta_tracks.status). */
type TesterStatus = "active" | "revoked" | "expired";

/**
 * How long a revoked/expired track keeps showing in the tester's list so they
 * can be told "this was pulled — remove it" and uninstall it. Bounds the list.
 */
const STALE_TAIL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * GET /api/v1/beta/mine
 *
 * The authenticated wallet's betas — every track whose allowlist contains this
 * wallet, in a tester-visible lifecycle state (active, plus recently revoked /
 * expired so the app can flag them and offer to uninstall). Powers the Canopy
 * tester app's "My betas" list. Returns a tester-safe view (no R2 internals);
 * binary affordances (APK SHA-256 / size / notes) are included ONLY for active
 * tracks so a revoked/expired track carries nothing installable.
 *
 * This is read-only and does not weaken any install guardrail: obtaining a
 * binary still requires /beta/install/initiate + /beta/download, which both
 * independently fail closed unless the track is active, not expired, and the
 * wallet is still allowlisted. Returning revoked metadata grants no download.
 *
 * Auth: SIWS session (cookie for web, Bearer token for the mobile app). Wallets
 * are matched by hash — plaintext addresses are never stored or compared.
 */
export async function GET(request: Request): Promise<NextResponse> {
    const session = await getSessionWallet();
    if (!session) return apiError("UNAUTHENTICATED", "Sign in with Solana to continue", 401);

    const admin = createSupabaseAdminClient();

    // 1. Tracks this wallet is a tester on.
    const { data: testerRows, error: testerErr } = await admin
        .from("beta_testers")
        .select("track_id")
        .eq("wallet_hash", session.walletHash);

    if (testerErr) return apiError("DB_ERROR", "Failed to load betas", 500);

    // Demo builds are public: visible to every signed-in wallet, on top of the
    // tracks this wallet is allowlisted for.
    const { data: demoRows } = await admin
        .from("beta_tracks")
        .select("id")
        .eq("is_demo", true)
        .eq("status", "active");

    const trackIds = [
        ...new Set([
            ...(testerRows ?? []).map((r) => r.track_id),
            ...(demoRows ?? []).map((r) => r.id),
        ]),
    ];
    if (trackIds.length === 0) return NextResponse.json({ betas: [] });

    // 2. Of those, the tester-visible ones: active, plus recently revoked/expired
    //    (so the app can flag them + offer uninstall). Scan-pipeline states
    //    (pending_scan/scan_in_progress/scan_passed/scan_failed) are never shown.
    const nowMs = Date.now();
    const { data: tracks, error: trackErr } = await admin
        .from("beta_tracks")
        .select(
            "id, app_id, version_name, version_code, apk_sha256, apk_size_bytes, status, release_notes, expires_at, updated_at",
        )
        .in("id", trackIds)
        .in("status", ["active", "revoked", "expired"])
        .order("created_at", { ascending: false });

    if (trackErr) return apiError("DB_ERROR", "Failed to load betas", 500);

    // Collapse to the 3 tester-facing states (an overdue "active" reads as expired).
    const deriveStatus = (t: { status: string; expires_at: string }): TesterStatus => {
        if (t.status === "revoked") return "revoked";
        if (t.status === "expired" || new Date(t.expires_at).getTime() <= nowMs) return "expired";
        return "active";
    };

    // Keep all active tracks; keep revoked/expired only within the stale-tail window.
    const trackList = (tracks ?? []).filter((t) => {
        if (deriveStatus(t) === "active") return true;
        const ref = new Date(t.updated_at ?? t.expires_at).getTime();
        return nowMs - ref <= STALE_TAIL_MS;
    });
    if (trackList.length === 0) return NextResponse.json({ betas: [] });

    // 3. Resolve app display info.
    const appIds = [...new Set(trackList.map((t) => t.app_id))];
    const { data: apps } = await admin
        .from("apps")
        .select("id, name, package_name, icon_key")
        .in("id", appIds);

    const appById = new Map((apps ?? []).map((a) => [a.id, a]));

    // Absolute icon URL on the host the client actually called, so it resolves
    // whether the app talks to prod or a local dev server.
    const baseUrl = new URL(request.url).origin;

    const betas = trackList.map((t) => {
        const app = appById.get(t.app_id);
        const status = deriveStatus(t);
        const active = status === "active";
        return {
            trackId: t.id,
            appName: app?.name ?? "Unknown app",
            // packageName is always present so the app can match an installed copy
            // and offer to uninstall a revoked/expired build.
            packageName: app?.package_name ?? null,
            // Real launcher icon (auto-extracted from the APK); null → monogram.
            iconUrl: app?.icon_key ? `${baseUrl}/api/v1/apps/${app.id}/icon` : null,
            versionName: t.version_name,
            versionCode: t.version_code,
            status,
            // Binary affordances only for active tracks — a revoked/expired track
            // exposes no fingerprint/size/notes (and its binary is purged anyway).
            apkSha256: active ? t.apk_sha256 : null,
            apkSizeBytes: active ? t.apk_size_bytes : null,
            releaseNotes: active ? t.release_notes : null,
            expiresAt: t.expires_at,
        };
    });

    return NextResponse.json({ betas });
}
