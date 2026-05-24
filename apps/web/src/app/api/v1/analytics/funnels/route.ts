import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const stepSchema = z.object({
    event_name: z.string().min(1).max(120),
    label: z.string().max(120).default(""),
});

const createSchema = z.object({
    appId: z.string().uuid(),
    name: z.string().min(1).max(120),
    steps: z.array(stepSchema).min(2).max(5),
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

    const { data, error } = await supabase
        .from("funnel_definitions")
        .select("*")
        .eq("app_id", appId)
        .order("created_at", { ascending: false });

    if (error) return apiError("DB_ERROR", "Failed to fetch funnels", 500);

    return NextResponse.json({ funnels: data });
}

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

    const { appId, name, steps } = parsed.data;
    const supabase = createSupabaseAdminClient();

    const owned = await verifyAppOwnership(supabase, appId, auth.publisher.id);
    if (!owned) return apiError("NOT_FOUND", "App not found", 404);

    const { data, error } = await supabase
        .from("funnel_definitions")
        .insert({ app_id: appId, name, steps })
        .select()
        .single();

    if (error) return apiError("DB_ERROR", "Failed to create funnel", 500);

    return NextResponse.json({ funnel: data }, { status: 201 });
}
