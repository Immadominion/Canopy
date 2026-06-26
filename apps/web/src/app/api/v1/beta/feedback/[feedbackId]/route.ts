import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidUuid } from "@canopy/utils";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({ status: z.enum(["open", "resolved", "archived"]) });

interface RouteParams {
    params: Promise<{ feedbackId: string }>;
}

/**
 * PATCH /api/v1/beta/feedback/[feedbackId] — triage a feedback item.
 * Owner-only (the publisher of the track the feedback belongs to).
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { feedbackId } = await params;
    if (!isValidUuid(feedbackId)) return notFound();

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
        return apiError("VALIDATION_ERROR", "Invalid status", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();
    const { data: fb } = await admin
        .from("beta_feedback")
        .select("id, track_id")
        .eq("id", feedbackId)
        .maybeSingle();
    if (!fb) return notFound();

    const { data: track } = await admin
        .from("beta_tracks")
        .select("publisher_id")
        .eq("id", fb.track_id)
        .maybeSingle();
    if (!track || track.publisher_id !== auth.publisher.id) return notFound();

    const { error } = await admin
        .from("beta_feedback")
        .update({ status: parsed.data.status })
        .eq("id", feedbackId);
    if (error) return apiError("DB_ERROR", "Failed to update feedback", 500);

    return NextResponse.json({ ok: true, status: parsed.data.status });
}
