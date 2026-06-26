import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({ isDemo: z.boolean() });

interface RouteParams {
    params: Promise<{ trackId: string }>;
}

/**
 * POST /api/v1/beta/[trackId]/demo — owner-only.
 *
 * Toggle a build as a public demo. A demo build is visible to and installable by
 * any signed-in wallet (the allowlist is bypassed for it). Used to show Canopy
 * to reviewers without knowing their wallets. Opt-in per build.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { trackId } = await params;
    if (!isValidUuid(trackId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();
    const { data: track } = await admin
        .from("beta_tracks")
        .select("id, publisher_id")
        .eq("id", trackId)
        .maybeSingle();
    if (!track || track.publisher_id !== auth.publisher.id) return notFound();

    const { error } = await admin
        .from("beta_tracks")
        .update({ is_demo: parsed.data.isDemo })
        .eq("id", trackId);
    if (error) return apiError("DB_ERROR", "Failed to update build", 500);

    return NextResponse.json({ isDemo: parsed.data.isDemo });
}
