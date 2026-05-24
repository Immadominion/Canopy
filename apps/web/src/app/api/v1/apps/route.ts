import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Android package name validation. Two or more dot-separated segments, each
// starts with a letter, and contains only letters/digits/underscores.
const PACKAGE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

const createAppSchema = z.object({
    name: z.string().trim().min(1).max(120),
    packageName: z
        .string()
        .trim()
        .min(3)
        .max(255)
        .regex(PACKAGE_NAME_PATTERN, "Must be a valid Android package name (e.g. com.example.app)"),
    description: z.string().trim().max(2000).optional(),
    dappStoreAppId: z.string().trim().max(255).optional(),
});

/**
 * GET /api/v1/apps — list apps owned by the signed-in publisher.
 *
 * Returns 401 for unauthenticated, 403 for non-publishers or KYC-unverified
 * publishers (INVARIANT 1). Cursor pagination via `?cursor=<created_at>` and
 * `?limit=<n>` (1..100, default 50). Cursor uses the row `created_at` so
 * results are stable for the human-scale fleet sizes expected here.
 */
export async function GET(request: Request): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number.parseInt(limitRaw ?? "50", 10) || 50, 1), 100);

    const admin = createSupabaseAdminClient();
    let query = admin
        .from("apps")
        .select("id, name, package_name, description, dapp_store_app_id, created_at, updated_at")
        .eq("publisher_id", auth.publisher.id)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

    if (cursor) {
        // cursor is the created_at ISO string of the last item from the previous page
        query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) {
        return apiError("DB_ERROR", "Failed to list apps", 500);
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.created_at : null;

    return NextResponse.json({
        items: items.map((row) => ({
            id: row.id,
            name: row.name,
            packageName: row.package_name,
            description: row.description,
            dappStoreAppId: row.dapp_store_app_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        })),
        nextCursor,
    });
}

/**
 * POST /api/v1/apps — create a new app for the signed-in publisher.
 *
 * INVARIANT 1: only KYC-verified publishers may create apps. Per-publisher
 * uniqueness on `package_name` is enforced by the DB constraint
 * `UNIQUE (publisher_id, package_name)`.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = createAppSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request body", 400, {
            fieldErrors: parsed.error.flatten().fieldErrors,
        });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from("apps")
        .insert({
            publisher_id: auth.publisher.id,
            name: parsed.data.name,
            package_name: parsed.data.packageName,
            description: parsed.data.description ?? null,
            dapp_store_app_id: parsed.data.dappStoreAppId ?? null,
        })
        .select("id, name, package_name, description, dapp_store_app_id, created_at, updated_at")
        .single();

    if (error) {
        // Postgres unique violation
        if (error.code === "23505") {
            return apiError(
                "PACKAGE_NAME_TAKEN",
                "An app with this package name already exists for this publisher",
                409,
            );
        }
        return apiError("DB_ERROR", "Failed to create app", 500);
    }

    return NextResponse.json(
        {
            id: data.id,
            name: data.name,
            packageName: data.package_name,
            description: data.description,
            dappStoreAppId: data.dapp_store_app_id,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        },
        { status: 201 },
    );
}
