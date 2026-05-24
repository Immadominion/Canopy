/**
 * GET /api/v1/analytics/[appId]/summary
 *
 * Returns DAU / WAU / MAU wallet counts and total event counts for an app.
 * Queries the `analytics_daw_daily` TimescaleDB continuous aggregate
 * (distinct wallets + event count per day per app).
 *
 * Auth: requires verified publisher who owns the app.
 *
 * Query params:
 *   none — returns rolling 30d / 7d / 1d windows
 */
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

interface SummaryRow {
    bucket: string;
    distinct_wallets: number;
    event_count: number;
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

    // Query rolling windows from the continuous aggregate.
    // Always include a time range — never full-scan the hypertable.
    const { data: rows, error } = await admin
        .from("analytics_daw_daily")
        .select("bucket, distinct_wallets, event_count")
        .eq("app_id", appId)
        .gte("bucket", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("bucket", { ascending: true });

    if (error) {
        console.error("[analytics/summary] query failed", error);
        return apiError("QUERY_FAILED", "Failed to load analytics summary", 500);
    }

    const typedRows = (rows ?? []) as SummaryRow[];

    // Aggregate into DAU (last 1d), WAU (last 7d), MAU (last 30d)
    const now = Date.now();
    const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // DAU = distinct wallets on the most recent day with data
    const recentDay = typedRows
        .filter((r) => new Date(r.bucket).getTime() >= oneDayAgo)
        .reduce((acc, r) => acc + r.distinct_wallets, 0);

    // WAU = distinct wallets in last 7 days (sum of daily distinct — approximate)
    const recentWeek = typedRows
        .filter((r) => new Date(r.bucket).getTime() >= sevenDaysAgo)
        .reduce((acc, r) => acc + r.distinct_wallets, 0);

    // MAU = distinct wallets in last 30 days (sum of all returned rows)
    const recentMonth = typedRows.reduce((acc, r) => acc + r.distinct_wallets, 0);

    const totalEvents = typedRows.reduce((acc, r) => acc + r.event_count, 0);

    return NextResponse.json({
        data: {
            dau: recentDay,
            wau: recentWeek,
            mau: recentMonth,
            totalEvents,
            // Include daily series for sparklines
            series: typedRows.map((r) => ({
                date: r.bucket,
                wallets: r.distinct_wallets,
                events: r.event_count,
            })),
        },
    });
}
