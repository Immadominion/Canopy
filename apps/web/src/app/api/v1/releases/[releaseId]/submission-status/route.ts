import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

interface RouteContext {
    params: Promise<{ releaseId: string }>;
}

/**
 * GET /api/v1/releases/[releaseId]/submission-status
 *
 * Returns the current submission status from Canopy's DB along with human-readable
 * guidance for the current state.
 *
 * NOTE: The Solana dApp Store does not expose a public REST API for submission
 * status polling. The publishing flow operates through the `@solana-mobile/dapp-publishing`
 * CLI, which creates/updates App NFTs on-chain. Automated status polling requires
 * querying the on-chain App NFT program — the program address and state schema are
 * not yet confirmed and require research during implementation.
 *
 * Until on-chain polling is implemented, this endpoint returns the DB status and
 * guides publishers to check the portal manually. The /sync POST route allows
 * publishers to advance the status once they have confirmed it in the portal.
 */
export async function GET(_req: NextRequest, context: RouteContext): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (auth.status === "not_publisher") return apiError("NOT_PUBLISHER", "Publisher profile required", 403);
    if (auth.status === "kyc_required") return apiError("KYC_REQUIRED", "KYC verification required", 403);

    const { releaseId } = await context.params;
    const supabase = createSupabaseAdminClient();

    const { data: release } = await supabase
        .from("releases")
        .select("id, status, dapp_store_submission_id, submitted_at, published_at")
        .eq("id", releaseId)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (!release) return apiError("NOT_FOUND", "Release not found", 404);

    const guidance = getSubmissionGuidance(release.status);

    return NextResponse.json({
        release_id: releaseId,
        status: release.status,
        submission_id: release.dapp_store_submission_id,
        submitted_at: release.submitted_at,
        published_at: release.published_at,
        guidance,
        // TODO: Add on-chain polling once the dApp Store App NFT program address
        // and state schema are confirmed. See:
        // https://github.com/solana-mobile/dapp-publishing
        polling_available: false,
    });
}

// ─────────────────────────────────────────────────────────────────────────────

const syncSchema = z.object({
    status: z.enum(["in_review", "published", "rejected"]),
    rejection_reason: z.string().max(1000).optional(),
});

/**
 * POST /api/v1/releases/[releaseId]/submission-status/sync
 *
 * Allows publishers to manually advance the submission status once they have
 * confirmed the new state in the dApp Store Publisher Portal.
 *
 * This endpoint bypasses the normal ALLOWED_TRANSITIONS guard (which blocks
 * `submitted → in_review → published/rejected` because those are normally
 * driven by a portal webhook). Publishers should use this endpoint only after
 * confirming the status in the portal.
 *
 * Allowed status values: in_review, published, rejected
 *
 * TODO: When the dApp Store Portal provides a webhook or on-chain event that
 * Canopy can subscribe to, replace this manual sync with automated polling.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (auth.status === "not_publisher") return apiError("NOT_PUBLISHER", "Publisher profile required", 403);
    if (auth.status === "kyc_required") return apiError("KYC_REQUIRED", "KYC verification required", 403);

    const { releaseId } = await context.params;
    const supabase = createSupabaseAdminClient();

    // Fetch current release
    const { data: release } = await supabase
        .from("releases")
        .select("id, status")
        .eq("id", releaseId)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (!release) return apiError("NOT_FOUND", "Release not found", 404);

    // Only allow sync when the release is in a portal-driven state
    if (!["submitted", "in_review"].includes(release.status)) {
        return apiError(
            "INVALID_STATE",
            "Status sync is only available for releases in the 'submitted' or 'in_review' state",
            422
        );
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return apiError("INVALID_BODY", "Expected JSON body", 400);
    }

    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fields: parsed.error.flatten().fieldErrors,
        });
    }

    const { status: newStatus, rejection_reason } = parsed.data;

    // Build the update
    const updates: {
        status: "draft" | "check_pending" | "check_passed" | "check_failed" | "submitted" | "in_review" | "published" | "rejected";
        published_at?: string;
        rejection_reason?: string;
    } = { status: newStatus };
    if (newStatus === "published") {
        updates.published_at = new Date().toISOString();
    }
    if (newStatus === "rejected" && rejection_reason) {
        updates.rejection_reason = rejection_reason;
    }

    const { data: updated, error } = await supabase
        .from("releases")
        .update(updates)
        .eq("id", releaseId)
        .eq("publisher_id", auth.publisher.id)
        .select("id, status, published_at")
        .single();

    if (error) {
        return apiError("UPDATE_FAILED", "Failed to update release status", 500);
    }

    return NextResponse.json({
        release_id: releaseId,
        previous_status: release.status,
        status: updated.status,
        published_at: updated.published_at,
    });
}

// ─────────────────────────────────────────────────────────────────────────────

function getSubmissionGuidance(status: string): string {
    switch (status) {
        case "submitted":
            return (
                "Your release has been submitted. Check the dApp Store Publisher Portal " +
                "(https://play.google.com/apps/publish/) for review status. " +
                "Once you see a status change, use the sync button to update it here."
            );
        case "in_review":
            return (
                "Your release is under review by the Solana Mobile team. " +
                "Check the dApp Store Publisher Portal for updates. " +
                "This phase typically takes a few business days."
            );
        case "published":
            return "Your release is live in the Solana dApp Store.";
        case "rejected":
            return (
                "Your release was rejected. Review the rejection reason, address the issues, " +
                "and create a new release."
            );
        default:
            return "Submit this release through the dApp Store Publisher Portal or the Canopy CLI.";
    }
}
