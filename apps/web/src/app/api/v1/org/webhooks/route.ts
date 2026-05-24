import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const VALID_EVENTS = [
    "install.authorised",
    "install.completed",
    "tester.added",
    "tester.removed",
    "track.created",
    "track.expired",
    "build.uploaded",
    "build.scan_passed",
    "build.scan_failed",
] as const;

const createSchema = z.object({
    appId: z.string().uuid(),
    url: z.string().url().startsWith("https://"),
    events: z
        .array(z.enum(VALID_EVENTS))
        .min(1)
        .max(VALID_EVENTS.length),
});

async function verifyAppOwnership(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    appId: string,
    publisherId: string,
): Promise<boolean> {
    const { data } = await supabase
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("publisher_id", publisherId)
        .maybeSingle();
    return data !== null;
}

/**
 * GET /api/v1/org/webhooks?appId=...
 *
 * Lists webhook endpoints for an app. Signing secrets are NOT returned.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status !== "ok") {
        return auth.status === "unauthenticated"
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : auth.status === "kyc_required"
                ? apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403)
                : apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
    }

    const appId = request.nextUrl.searchParams.get("appId");
    if (!appId) return apiError("MISSING_PARAM", "appId is required", 400);

    const supabase = createSupabaseAdminClient();
    const owned = await verifyAppOwnership(supabase, appId, auth.publisher.id);
    if (!owned) return apiError("NOT_FOUND", "App not found", 404);

    // Exclude signing_secret from the response — it is service-role only
    const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("id, app_id, url, events, enabled, created_at, updated_at")
        .eq("app_id", appId)
        .order("created_at", { ascending: false });

    if (error) return apiError("DB_ERROR", "Failed to fetch webhook endpoints", 500);

    return NextResponse.json({ endpoints: data });
}

/**
 * POST /api/v1/org/webhooks
 *
 * Creates a webhook endpoint. Returns the signing secret once — it is not
 * accessible again after this response.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status !== "ok") {
        return auth.status === "unauthenticated"
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : auth.status === "kyc_required"
                ? apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403)
                : apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
    }

    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.flatten() as unknown as Record<string, unknown>,
        });
    }

    const { appId, url, events } = parsed.data;
    const supabase = createSupabaseAdminClient();

    const owned = await verifyAppOwnership(supabase, appId, auth.publisher.id);
    if (!owned) return apiError("NOT_FOUND", "App not found", 404);

    // Generate a 32-byte hex signing secret. Returned once; never re-shown.
    const signingSecret = randomBytes(32).toString("hex");

    const { data, error } = await supabase
        .from("webhook_endpoints")
        .insert({
            app_id: appId,
            url,
            events,
            signing_secret: signingSecret,
            enabled: true,
        })
        .select("id, app_id, url, events, enabled, created_at, updated_at")
        .single();

    if (error) return apiError("DB_ERROR", "Failed to create webhook endpoint", 500);

    // Include signing_secret in this one response only
    return NextResponse.json(
        { endpoint: data, signing_secret: signingSecret },
        { status: 201 },
    );
}
