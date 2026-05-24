import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { CohortCriteria } from "@canopy/types";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type RouteParams = Promise<{ cohortId: string }>;

async function resolveCohortOwnership(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    cohortId: string,
    publisherId: string,
): Promise<{ id: string; name: string; criteria: CohortCriteria } | null> {
    const { data } = await supabase
        .from("cohort_definitions")
        .select("id, name, criteria")
        .eq("id", cohortId)
        .eq("publisher_id", publisherId)
        .maybeSingle();
    if (!data) return null;
    return { id: data.id, name: data.name, criteria: data.criteria as CohortCriteria };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: RouteParams },
): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status !== "ok") {
        return auth.status === "unauthenticated"
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : auth.status === "kyc_required"
                ? apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403)
                : apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
    }

    const { cohortId } = await params;
    const supabase = createSupabaseAdminClient();
    const cohort = await resolveCohortOwnership(supabase, cohortId, auth.publisher.id);
    if (!cohort) return apiError("NOT_FOUND", "Cohort not found", 404);

    const { data } = await supabase
        .from("cohort_definitions")
        .select("*")
        .eq("id", cohortId)
        .single();

    return NextResponse.json({ cohort: data });
}

const updateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    criteria: z
        .object({
            operator: z.enum(["and", "or"]),
            conditions: z.array(z.record(z.unknown())).min(1).max(20),
        })
        .optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: RouteParams },
): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status !== "ok") {
        return auth.status === "unauthenticated"
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : auth.status === "kyc_required"
                ? apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403)
                : apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
    }

    const { cohortId } = await params;
    const supabase = createSupabaseAdminClient();
    const cohort = await resolveCohortOwnership(supabase, cohortId, auth.publisher.id);
    if (!cohort) return apiError("NOT_FOUND", "Cohort not found", 404);

    const body: unknown = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            issues: parsed.error.flatten() as unknown as Record<string, unknown>,
        });
    }

    const typedUpdate: {
        name?: string;
        description?: string | null;
        criteria?: CohortCriteria;
    } = {};

    if (parsed.data.name !== undefined) typedUpdate.name = parsed.data.name;
    if ("description" in parsed.data) typedUpdate.description = parsed.data.description ?? null;
    if (parsed.data.criteria !== undefined) {
        typedUpdate.criteria = parsed.data.criteria as unknown as CohortCriteria;
    }

    const { data, error } = await supabase
        .from("cohort_definitions")
        .update(typedUpdate)
        .eq("id", cohortId)
        .select("*")
        .single();

    if (error) return apiError("DB_ERROR", "Failed to update cohort", 500);

    return NextResponse.json({ cohort: data });
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: RouteParams },
): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status !== "ok") {
        return auth.status === "unauthenticated"
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : auth.status === "kyc_required"
                ? apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403)
                : apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
    }

    const { cohortId } = await params;
    const supabase = createSupabaseAdminClient();
    const cohort = await resolveCohortOwnership(supabase, cohortId, auth.publisher.id);
    if (!cohort) return apiError("NOT_FOUND", "Cohort not found", 404);

    const { error } = await supabase.from("cohort_definitions").delete().eq("id", cohortId);
    if (error) return apiError("DB_ERROR", "Failed to delete cohort", 500);

    return new NextResponse(null, { status: 204 });
}
