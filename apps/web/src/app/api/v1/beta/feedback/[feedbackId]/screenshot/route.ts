import { isValidUuid } from "@canopy/utils";

import { getCurrentPublisher } from "@/lib/auth/session";
import { downloadApkFromR2 } from "@/lib/r2/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ feedbackId: string }>;
}

/**
 * Sniff the image type from magic bytes. We MUST NOT trust the Content-Type
 * stored on the R2 object: the screenshot was uploaded via an unbound presigned
 * PUT, so its stored content-type is attacker-controlled. Reflecting it (e.g.
 * text/html with a <script> payload) would be stored XSS on the first-party
 * origin when the publisher views it. Only a recognized image is ever served.
 */
function sniffImageMime(b: Buffer): string | null {
    if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
        return "image/png";
    }
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        b.length >= 12 &&
        b.toString("ascii", 0, 4) === "RIFF" &&
        b.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "image/webp";
    }
    if (b.length >= 6 && (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a")) {
        return "image/gif";
    }
    return null;
}

/**
 * GET /api/v1/beta/feedback/[feedbackId]/screenshot
 *
 * Streams a feedback screenshot from the private R2 bucket. Publisher-only: the
 * caller must own the track the feedback belongs to. The response type is
 * derived from the file's actual magic bytes (never the attacker-controlled
 * stored content-type), is hardened against MIME sniffing, and runs under a
 * locked-down CSP so a non-image upload can never execute on our origin.
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

    let bytes: Buffer;
    try {
        bytes = await downloadApkFromR2(fb.screenshot_key);
    } catch {
        return new Response(null, { status: 404 });
    }

    const mime = sniffImageMime(bytes);
    // Not a recognized image — refuse rather than serve attacker-controlled bytes.
    if (!mime) return new Response(null, { status: 415 });

    return new Response(new Uint8Array(bytes), {
        headers: {
            "Content-Type": mime,
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
            "Cache-Control": "private, max-age=300",
        },
    });
}
