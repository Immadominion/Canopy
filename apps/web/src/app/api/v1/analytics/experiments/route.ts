import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Json } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const variantSchema = z.object({
    name: z.string().min(1).max(80),
    weight: z.number().int().min(1).default(1),
    config_value: z.unknown().optional(),
});

const createSchema = z.object({
    appId: z.string().uuid(),
    name: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    traffic_percentage: z.number().int().min(1).max(100).default(100),
    remote_config_id: z.string().uuid().optional(),
    variants: z.array(variantSchema).min(2).max(10),
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
        .from("experiments")
        .select("*, experiment_variants(*)")
        .eq("app_id", appId)
        .order("created_at", { ascending: false });

    if (error) return apiError("DB_ERROR", "Failed to fetch experiments", 500);

    return NextResponse.json({ experiments: data });
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

    const { appId, name, description, traffic_percentage, remote_config_id, variants } =
        parsed.data;

    const supabase = createSupabaseAdminClient();
    const owned = await verifyAppOwnership(supabase, appId, auth.publisher.id);
    if (!owned) return apiError("NOT_FOUND", "App not found", 404);

    // If a remote_config_id is provided, verify it belongs to the same app
    if (remote_config_id) {
        const { data: rc } = await supabase
            .from("remote_configs")
            .select("id")
            .eq("id", remote_config_id)
            .eq("app_id", appId)
            .maybeSingle();
        if (!rc) return apiError("NOT_FOUND", "Remote config key not found", 404);
    }

    // Create the experiment
    const { data: experiment, error: expErr } = await supabase
        .from("experiments")
        .insert({
            app_id: appId,
            name,
            description: description ?? null,
            traffic_percentage,
            remote_config_id: remote_config_id ?? null,
        })
        .select("id")
        .single();

    if (expErr ?? !experiment) {
        return apiError("DB_ERROR", "Failed to create experiment", 500);
    }

    // Insert variants
    const { error: varErr } = await supabase.from("experiment_variants").insert(
        variants.map((v) => ({
            experiment_id: experiment.id,
            name: v.name,
            weight: v.weight,
            config_value: v.config_value !== undefined ? (v.config_value as Json) : null,
        })),
    );

    if (varErr) return apiError("DB_ERROR", "Failed to create experiment variants", 500);

    const { data: full } = await supabase
        .from("experiments")
        .select("*, experiment_variants(*)")
        .eq("id", experiment.id)
        .single();

    return NextResponse.json({ experiment: full }, { status: 201 });
}
