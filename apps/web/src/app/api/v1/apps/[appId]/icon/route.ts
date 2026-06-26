import { isValidUuid } from "@canopy/utils";

import { safeImageHeaders, sniffImageMime } from "@/lib/images/sniff";
import { downloadApkFromR2 } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ appId: string }>;
}

/**
 * GET /api/v1/apps/[appId]/icon
 *
 * The app's launcher icon, auto-extracted from its latest build and stored in
 * R2. Public (icons are not sensitive; appIds are unguessable UUIDs) so a plain
 * <img>/Image can render it. The type is derived from magic bytes (never the
 * stored content-type) with nosniff + a locked CSP. 404 when no icon is stored
 * — callers fall back to a monogram.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
    const { appId } = await params;
    if (!isValidUuid(appId)) return new Response(null, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: app } = await admin
        .from("apps")
        .select("icon_key")
        .eq("id", appId)
        .maybeSingle();
    if (!app?.icon_key) return new Response(null, { status: 404 });

    let bytes: Buffer;
    try {
        bytes = await downloadApkFromR2(app.icon_key);
    } catch {
        return new Response(null, { status: 404 });
    }

    const mime = sniffImageMime(bytes);
    if (!mime) return new Response(null, { status: 415 });

    return new Response(new Uint8Array(bytes), {
        headers: { ...safeImageHeaders(mime), "Cache-Control": "public, max-age=3600" },
    });
}
