/**
 * GET /api/v1/crashes/[appId]
 *
 * Lists crash report groups for an app, ordered by last_seen_at DESC.
 * Cursor-based pagination using the crash report ID.
 *
 * Query params:
 *   status  — "open" (default) | "resolved" | "all"
 *   cursor  — UUID of the last item returned (for pagination)
 *   limit   — number of results per page (default: 20, max: 100)
 *
 * Auth: requires verified publisher who owns the app.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, notFound } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

const listQuerySchema = z.object({
    status: z.enum(["open", "resolved", "all"]).default("open"),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

interface RouteContext {
    params: Promise<{ appId: string }>;
}

export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { appId } = await ctx.params;
    if (!uuidSchema.safeParse(appId).success) return notFound();

    const url = new URL(request.url);
    const queryParse = listQuerySchema.safeParse({
        status: url.searchParams.get("status") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!queryParse.success) {
        return apiError("INVALID_PARAMS", "Invalid query parameters", 400);
    }
    const { status, cursor, limit } = queryParse.data;

    const admin = createSupabaseAdminClient();

    // Verify the publisher owns this app (return 404 to avoid leaking existence)
    const { data: app } = await admin
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("publisher_id", auth.publisher.id)
        .maybeSingle();

    if (!app) return notFound();

    let query = admin
        .from("crash_reports")
        .select(
            "id, fingerprint, error_message, app_version, occurrence_count, first_seen_at, last_seen_at, resolved_at",
        )
        .eq("app_id", appId)
        .order("last_seen_at", { ascending: false })
        .limit(limit + 1); // fetch one extra to determine if there's a next page

    if (status === "open") {
        query = query.is("resolved_at", null);
    } else if (status === "resolved") {
        query = query.not("resolved_at", "is", null);
    }

    if (cursor) {
        // Cursor pagination: find last_seen_at for the cursor ID, then filter
        const { data: cursorRow } = await admin
            .from("crash_reports")
            .select("last_seen_at")
            .eq("id", cursor)
            .eq("app_id", appId)
            .maybeSingle();

        if (cursorRow) {
            query = query.lt("last_seen_at", cursorRow.last_seen_at);
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error("[crashes/list] query failed", error);
        return apiError("DB_ERROR", "Failed to fetch crash reports", 500);
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

    return NextResponse.json({
        data: items.map((r) => ({
            id: r.id,
            fingerprint: r.fingerprint,
            errorMessage: r.error_message,
            appVersion: r.app_version,
            occurrenceCount: r.occurrence_count,
            firstSeenAt: r.first_seen_at,
            lastSeenAt: r.last_seen_at,
            resolvedAt: r.resolved_at,
        })),
        cursor: nextCursor,
    });
}
