import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

interface Params {
    params: Promise<{ appId: string }>;
}

/**
 * GET /api/v1/analytics/[appId]/nft-cohort
 *
 * Returns wallet counts split by `has_genesis_token` (Seeker Genesis Token NFT
 * collection holder) for a rolling 30-day window (or custom `?since=` ISO).
 *
 * Response shape:
 *   {
 *     holders:     number,   // wallets with has_genesis_token = true
 *     non_holders: number,   // wallets with has_genesis_token = false
 *     total:       number,
 *     since:       string,   // ISO timestamp
 *   }
 */
export async function GET(req: NextRequest, { params }: Params) {
    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return apiError("UNAUTHENTICATED", "Not authenticated", 401);
    if (auth.status === "not_publisher") return apiError("NOT_PUBLISHER", "Publisher profile required", 403);
    if (auth.status === "kyc_required") return apiError("KYC_REQUIRED", "KYC verification required", 403);

    const { appId } = await params;

    const sinceParam = req.nextUrl.searchParams.get("since");
    const since = sinceParam
        ? new Date(sinceParam).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const supabase = createSupabaseAdminClient();

    // Verify app ownership
    const { data: app } = await supabase
        .from("apps")
        .select("id, publisher_id")
        .eq("id", appId)
        .single();

    if (!app) return apiError("NOT_FOUND", "App not found", 404);
    if (app.publisher_id !== auth.publisher.id) {
        return apiError("FORBIDDEN", "App access denied", 403);
    }

    const { data, error } = await supabase.rpc("get_nft_cohorts", {
        _app_id: appId,
        _since: since,
    });

    if (error) {
        return apiError("QUERY_ERROR", "Failed to query NFT cohort data", 500);
    }

    const rows = data ?? [];
    const holders = rows.find((r) => r.has_genesis_token)?.distinct_wallets ?? 0;
    const nonHolders = rows.find((r) => !r.has_genesis_token)?.distinct_wallets ?? 0;

    return NextResponse.json({
        holders,
        non_holders: nonHolders,
        total: holders + nonHolders,
        since,
    });
}
