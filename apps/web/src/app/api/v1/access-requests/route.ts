import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { getSessionWallet } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createAccessRequest } from "@/lib/verification/access";

const requestSchema = z.object({
    displayName: z.string().trim().min(1).max(120),
    projectSummary: z.string().trim().min(1).max(2000),
    contactTelegram: z.string().trim().max(64).optional(),
});

/**
 * Ensure a publishers row exists for the signed-in wallet and return its id +
 * status. New wallets start as `unverified`.
 */
async function ensurePublisher(
    walletAddress: string,
    walletHash: string,
): Promise<{ id: string; verificationStatus: string } | null> {
    const admin = createSupabaseAdminClient();

    const { data: existing } = await admin
        .from("publishers")
        .select("id, verification_status")
        .eq("wallet_hash", walletHash)
        .maybeSingle();

    if (existing) return { id: existing.id, verificationStatus: existing.verification_status };

    const { data: created, error } = await admin
        .from("publishers")
        .insert({ wallet_address: walletAddress, wallet_hash: walletHash })
        .select("id, verification_status")
        .single();

    if (error || !created) {
        // Lost an insert race — re-read.
        const { data: again } = await admin
            .from("publishers")
            .select("id, verification_status")
            .eq("wallet_hash", walletHash)
            .maybeSingle();
        return again ? { id: again.id, verificationStatus: again.verification_status } : null;
    }
    return { id: created.id, verificationStatus: created.verification_status };
}

/**
 * GET /api/v1/access-requests — the signed-in wallet's verification status and
 * latest request (if any).
 */
export async function GET(): Promise<NextResponse> {
    const session = await getSessionWallet();
    if (!session) return apiError("UNAUTHENTICATED", "Authentication required", 401);

    const admin = createSupabaseAdminClient();
    const { data: publisher } = await admin
        .from("publishers")
        .select("id, verification_status")
        .eq("wallet_hash", session.walletHash)
        .maybeSingle();

    if (!publisher) {
        return NextResponse.json({ verificationStatus: "unverified", request: null });
    }

    const { data: req } = await admin
        .from("access_requests")
        .select("id, display_name, project_summary, code, status, created_at")
        .eq("publisher_id", publisher.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    return NextResponse.json({
        verificationStatus: publisher.verification_status,
        request: req
            ? {
                  id: req.id,
                  displayName: req.display_name,
                  projectSummary: req.project_summary,
                  code: req.code,
                  status: req.status,
                  createdAt: req.created_at,
              }
            : null,
    });
}

/**
 * POST /api/v1/access-requests — submit a request for publisher access. Creates
 * the publishers row on first use. Idempotent while a request is pending.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const session = await getSessionWallet();
    if (!session) return apiError("UNAUTHENTICATED", "Authentication required", 401);

    // Per-IP speed bump: caps publisher-row / founder-notification spam from a
    // wallet-rotating attacker. Best-effort (in-memory) — see lib/rate-limit.ts.
    const rl = rateLimit(`access-request:${clientIp(request)}`, 8, 10 * 60 * 1000);
    if (!rl.allowed) {
        return apiError("RATE_LIMITED", "Too many requests — please slow down", 429, {
            retryAfterSeconds: rl.retryAfterSeconds,
        });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fieldErrors: parsed.error.flatten().fieldErrors,
        });
    }

    const publisher = await ensurePublisher(session.walletAddress, session.walletHash);
    if (!publisher) return apiError("DB_ERROR", "Failed to resolve publisher", 500);

    const result = await createAccessRequest({
        publisherId: publisher.id,
        walletHash: session.walletHash,
        walletAddress: session.walletAddress,
        displayName: parsed.data.displayName,
        projectSummary: parsed.data.projectSummary,
        contactTelegram: parsed.data.contactTelegram ?? null,
    });

    switch (result.status) {
        case "created":
            return NextResponse.json(
                { status: "pending", code: result.code, requestId: result.requestId },
                { status: 201 },
            );
        case "already_pending":
            return NextResponse.json({
                status: "pending",
                code: result.code,
                requestId: result.requestId,
            });
        case "already_approved":
            return NextResponse.json({ status: "approved" });
        case "error":
            if (result.message === "BANNED") {
                return apiError("BANNED", "This wallet is not eligible", 403);
            }
            return apiError("DB_ERROR", "Failed to submit request", 500);
    }
}
