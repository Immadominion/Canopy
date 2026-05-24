import { NextResponse } from "next/server";
import { z } from "zod";

import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Database } from "@canopy/types";

type ReleaseUpdate = Database["public"]["Tables"]["releases"]["Update"];

const log = logger.child({ route: "releases/[releaseId]" });

export const runtime = "nodejs";

// Only these transitions are allowed from the dashboard / CLI / Action.
// The dApp Store portal drives submitted → in_review → published/rejected.
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
    draft: ["check_pending", "check_passed", "check_failed"],
    check_pending: ["check_passed", "check_failed"],
    check_passed: ["submitted"],
    check_failed: ["check_pending", "draft"],
    submitted: [],      // terminal until portal callback
    in_review: [],      // terminal until portal callback
    published: [],      // terminal
    rejected: ["draft"], // publisher may fix and resubmit
} as const;

const patchSchema = z.object({
    status: z
        .enum([
            "draft",
            "check_pending",
            "check_passed",
            "check_failed",
            "submitted",
            "in_review",
            "published",
            "rejected",
        ])
        .optional(),
    releaseNotes: z.string().max(2000).optional(),
    checkResults: z
        .object({
            passed: z.boolean(),
            checks: z.array(
                z.object({
                    name: z.string(),
                    passed: z.boolean(),
                    detail: z.string(),
                }),
            ),
        })
        .optional(),
    rejectionReason: z.string().max(1000).optional(),
});

type RouteContext = { params: Promise<{ releaseId: string }> };

/**
 * GET /api/v1/releases/[releaseId]
 *
 * Returns the full release record including check_results JSONB.
 */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") {
        return apiError("UNAUTHENTICATED", "Sign in with Solana to continue", 401);
    }
    if (auth.status === "not_publisher") {
        return apiError("NOT_A_PUBLISHER", "Wallet has no publisher record", 403);
    }
    if (auth.status === "kyc_required") {
        return apiError(
            "KYC_REQUIRED",
            "Complete KYC/KYB verification on the dApp Store Publisher Portal first",
            403,
        );
    }

    const { publisher } = auth;
    const { releaseId } = await context.params;

    const admin = createSupabaseAdminClient();

    const { data: release } = await admin
        .from("releases")
        .select(
            "id, app_id, beta_track_id, version_name, version_code, status, release_notes, apk_sha256, check_results, dapp_store_submission_id, rejection_reason, submitted_at, published_at, created_at, updated_at",
        )
        .eq("id", releaseId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!release) {
        return apiError("NOT_FOUND", "Release not found", 404);
    }

    return NextResponse.json({ data: release });
}

/**
 * PATCH /api/v1/releases/[releaseId]
 *
 * Allowed updates:
 *   - status          (must follow allowed state transitions)
 *   - releaseNotes    (editable until submitted)
 *   - checkResults    (written by CLI / Action)
 *   - rejectionReason (only meaningful for rejected status)
 */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") {
        return apiError("UNAUTHENTICATED", "Sign in with Solana to continue", 401);
    }
    if (auth.status === "not_publisher") {
        return apiError("NOT_A_PUBLISHER", "Wallet has no publisher record", 403);
    }
    if (auth.status === "kyc_required") {
        return apiError(
            "KYC_REQUIRED",
            "Complete KYC/KYB verification on the dApp Store Publisher Portal first",
            403,
        );
    }

    const { publisher } = auth;
    const { releaseId } = await context.params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_BODY", "Expected JSON body", 400);
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();

    const { data: current } = await admin
        .from("releases")
        .select("id, status")
        .eq("id", releaseId)
        .eq("publisher_id", publisher.id)
        .maybeSingle();

    if (!current) {
        return apiError("NOT_FOUND", "Release not found", 404);
    }

    const { status: newStatus, releaseNotes, checkResults, rejectionReason } = parsed.data;

    // Validate status transition if status is being updated.
    if (newStatus !== undefined && newStatus !== current.status) {
        const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(newStatus)) {
            return apiError(
                "INVALID_TRANSITION",
                `Cannot transition from '${current.status}' to '${newStatus}'`,
                422,
            );
        }
    }

    // Disallow editing release notes once submitted or beyond.
    if (
        releaseNotes !== undefined &&
        ["submitted", "in_review", "published"].includes(current.status)
    ) {
        return apiError(
            "IMMUTABLE_FIELD",
            "Release notes cannot be edited after submission",
            422,
        );
    }

    const updates: ReleaseUpdate = {};

    if (newStatus !== undefined) {
        updates.status = newStatus;

        if (newStatus === "submitted") {
            updates.submitted_at = new Date().toISOString();
        }
        if (newStatus === "published") {
            updates.published_at = new Date().toISOString();
        }
    }

    if (releaseNotes !== undefined) {
        updates.release_notes = releaseNotes;
    }
    if (checkResults !== undefined) {
        // exactOptionalPropertyTypes: cast to the DB type to strip the Zod-inferred undefined
        const cr: ReleaseUpdate["check_results"] = checkResults;
        updates.check_results = cr;
    }
    if (rejectionReason !== undefined) {
        updates.rejection_reason = rejectionReason;
    }

    if (Object.keys(updates).length === 0) {
        return apiError("NO_CHANGES", "No updatable fields were provided", 400);
    }

    const { data: updated, error: updateError } = await admin
        .from("releases")
        .update(updates)
        .eq("id", releaseId)
        .eq("publisher_id", publisher.id)
        .select(
            "id, version_name, version_code, status, release_notes, check_results, submitted_at, published_at, updated_at",
        )
        .single();

    if (updateError || !updated) {
        log.error({ error: updateError, releaseId }, "Failed to update release");
        return apiError("INTERNAL_ERROR", "Failed to update release", 500);
    }

    return NextResponse.json({ data: updated });
}
