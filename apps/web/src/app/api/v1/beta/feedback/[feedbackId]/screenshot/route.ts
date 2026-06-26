import { isValidUuid } from "@canopy/utils";

import { getCurrentPublisher } from "@/lib/auth/session";
import { fetchApkFromR2 } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ feedbackId: string }>;
}

/**
 * GET /api/v1/beta/feedback/[feedbackId]/screenshot
 *
 * Streams a feedback screenshot from the private R2 bucket. Publisher-only:
 * the caller must own the track the feedback belongs to. 404 hides existence
 * for anything else.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
    const { feedbackId } = await params;
    if (!isValidUuid(feedbackId)) return new Response(null, { status: 404 });

    const publisher = await getCurrentPublisher();
    if (!publisher) return new Response(null, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: fb } = await admin
        .from("beta_feedback")
        .select("screenshot_key, track_id")
        .eq("id", feedbackId)
        .maybeSingle();
    if (!fb?.screenshot_key) return new Response(null, { status: 404 });

    const { data: track } = await admin
        .from("beta_tracks")
        .select("publisher_id")
        .eq("id", fb.track_id)
        .maybeSingle();
    if (!track || track.publisher_id !== publisher.id) return new Response(null, { status: 404 });

    try {
        const { body, contentType } = await fetchApkFromR2(fb.screenshot_key);
        return new Response(body, {
            headers: {
                "Content-Type": contentType ?? "image/jpeg",
                "Cache-Control": "private, max-age=300",
            },
        });
    } catch {
        return new Response(null, { status: 404 });
    }
}
