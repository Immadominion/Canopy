import { type NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api/errors";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type RouteParams = Promise<{ appId: string }>;

async function verifyAppOwnership(
    supabase: ReturnType<typeof createSupabaseAdminClient>,
    appId: string,
    publisherId: string,
): Promise<boolean> {
    const { data } = await supabase
        .from("apps")
        .select("id")
        .eq("id", appId)
        .eq("publisher_id", publisherId)
        .maybeSingle();
    return data !== null;
}

function escapeCSVCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    const str = String(value);
    // Wrap in double quotes if the value contains comma, newline, or double-quote
    if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * GET /api/v1/analytics/[appId]/export?since=...&until=...&format=csv
 *
 * Exports raw analytics events as CSV. Default format is CSV.
 * Always includes a time range filter — required for TimescaleDB hypertable.
 * Capped at 50 000 rows to prevent runaway queries.
 */
export async function GET(
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

    const { appId } = await params;
    const supabase = createSupabaseAdminClient();
    const owned = await verifyAppOwnership(supabase, appId, auth.publisher.id);
    if (!owned) return apiError("NOT_FOUND", "App not found", 404);

    const sinceParam = request.nextUrl.searchParams.get("since");
    const untilParam = request.nextUrl.searchParams.get("until");

    // Default: last 7 days. Max range enforced implicitly by the 50k row cap.
    const since = sinceParam
        ? new Date(sinceParam).toISOString()
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const until = untilParam ? new Date(untilParam).toISOString() : new Date().toISOString();

    // Query analytics_events — always filter by time (TimescaleDB hypertable)
    const { data, error } = await supabase
        .from("analytics_events")
        .select(
            "id, session_id, name, wallet_hash, app_version, platform, is_seeker, has_genesis_token, skr_balance_tier, properties, timestamp",
        )
        .eq("app_id", appId)
        .gte("timestamp", since)
        .lte("timestamp", until)
        .order("timestamp", { ascending: true })
        .limit(50_000);

    if (error) return apiError("QUERY_ERROR", "Failed to export events", 500);

    // Build CSV manually — no library needed
    const headers = [
        "id",
        "session_id",
        "event_name",
        "wallet_hash",
        "app_version",
        "platform",
        "is_seeker",
        "has_genesis_token",
        "skr_balance_tier",
        "properties",
        "timestamp",
    ];

    const rows: string[] = [headers.join(",")];

    for (const row of data) {
        const cells = [
            escapeCSVCell(row.id),
            escapeCSVCell(row.session_id),
            escapeCSVCell(row.name),
            escapeCSVCell(row.wallet_hash),
            escapeCSVCell(row.app_version),
            escapeCSVCell(row.platform),
            escapeCSVCell(row.is_seeker),
            escapeCSVCell(row.has_genesis_token),
            escapeCSVCell(row.skr_balance_tier),
            escapeCSVCell(typeof row.properties === "object" ? JSON.stringify(row.properties) : row.properties),
            escapeCSVCell(row.timestamp),
        ];
        rows.push(cells.join(","));
    }

    const csv = rows.join("\n");
    const filename = `canopy_events_${appId}_${since.slice(0, 10)}_${until.slice(0, 10)}.csv`;

    return new NextResponse(csv, {
        status: 200,
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}
