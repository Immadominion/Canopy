import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/admin";
import { decideAccessRequest } from "@/lib/verification/access";

const decisionSchema = z.object({
    decision: z.enum(["approve", "reject"]),
});

/**
 * POST /api/v1/admin/access-requests/[id]/decision
 *
 * Admin-only fallback to the Telegram approve/reject buttons. Guarded by the
 * ADMIN_WALLET_HASHES allowlist (the founder's own SIWS wallet).
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return admin.status === 401
            ? apiError("UNAUTHENTICATED", "Authentication required", 401)
            : apiError("FORBIDDEN", "Admin access required", 403);
    }

    const { id } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "decision must be 'approve' or 'reject'", 400);
    }

    const result = await decideAccessRequest({
        requestId: id,
        decision: parsed.data.decision,
        decidedBy: `wallet:${admin.walletHash}`,
    });

    if (!result.ok) return apiError("NOT_FOUND", "Access request not found", 404);

    return NextResponse.json({
        ok: true,
        decision: parsed.data.decision,
        alreadyDecided: result.alreadyDecided,
        publisherId: result.publisherId,
    });
}
