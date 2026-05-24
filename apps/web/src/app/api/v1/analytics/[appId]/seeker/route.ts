/**
 * GET /api/v1/analytics/[appId]/seeker
 *
 * Returns Seeker vs non-Seeker wallet breakdown per day for the last 30 days.
 * Queries the `analytics_seeker_daily` TimescaleDB continuous aggregate.
 *
 * Auth: requires verified publisher who owns the app.
 */
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * analytics_seeker_daily view schema:
 *   app_id, bucket, is_seeker bool, distinct_wallets int
 * The view produces TWO rows per day — one for is_seeker=true, one for false.
 */
interface SeekerRow {
    bucket: string;
    is_seeker: boolean;
    distinct_wallets: number;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
    const auth = await requireVerifiedPublisher();
    switch (auth.status) {
        case "unauthenticated":
            return apiError("UNAUTHENTICATED", "Authentication required", 401);
        case "not_publisher":
            return apiError("NOT_A_PUBLISHER", "Wallet is not a registered publisher", 403);
        case "kyc_required":
            return apiError("KYC_REQUIRED", "Publisher must complete KYC verification", 403);
    }

    const { appId } = await params;

    const admin = createSupabaseAdminClient();

    // Verify the publisher owns this app
    const { data: app, error: appError } = await admin
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("publisher_id", auth.publisher.id)
        .single();

    if (appError ?? !app) {
        return apiError("NOT_FOUND", "App not found", 404);
    }

    const { data: rows, error } = await admin
        .from("analytics_seeker_daily")
        .select("bucket, is_seeker, distinct_wallets")
        .eq("app_id", appId)
        .gte("bucket", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("bucket", { ascending: true });

    if (error) {
        console.error("[analytics/seeker] query failed", error);
        return apiError("QUERY_FAILED", "Failed to load Seeker breakdown", 500);
    }

    const typedRows = (rows ?? []) as SeekerRow[];

    // Aggregate totals
    let totalSeekerWallets = 0;
    let totalNonSeekerWallets = 0;
    typedRows.forEach((r) => {
        if (r.is_seeker) totalSeekerWallets += r.distinct_wallets;
        else totalNonSeekerWallets += r.distinct_wallets;
    });

    // Build daily series: merge the two rows per day into a single entry
    const seekerByDay = new Map<string, { seekerWallets: number; nonSeekerWallets: number }>();
    typedRows.forEach((r) => {
        const entry = seekerByDay.get(r.bucket) ?? { seekerWallets: 0, nonSeekerWallets: 0 };
        if (r.is_seeker) entry.seekerWallets += r.distinct_wallets;
        else entry.nonSeekerWallets += r.distinct_wallets;
        seekerByDay.set(r.bucket, entry);
    });

    return NextResponse.json({
        data: {
            totals: {
                seekerWallets: totalSeekerWallets,
                nonSeekerWallets: totalNonSeekerWallets,
            },
            series: Array.from(seekerByDay.entries()).map(([date, v]) => ({
                date,
                seekerWallets: v.seekerWallets,
                nonSeekerWallets: v.nonSeekerWallets,
            })),
        },
    });
}
