import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidSolanaAddress, isValidUuid } from "@canopy/utils";

import { hashWalletAddress } from "@/lib/auth/siws";
import { requireVerifiedPublisher } from "@/lib/auth/session";
import { apiError, notFound } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface RouteParams {
    params: Promise<{ groupId: string }>;
}

const bodySchema = z.object({
    walletAddresses: z.array(z.string().min(32).max(44)).min(1).max(50),
});

/** Load the group iff it exists and the caller owns it; else null (→ 404). */
async function loadOwnedGroup(
    admin: AdminClient,
    groupId: string,
    publisherId: string,
): Promise<{ id: string } | null> {
    const { data } = await admin
        .from("tester_groups")
        .select("id, publisher_id")
        .eq("id", groupId)
        .maybeSingle();
    if (!data || data.publisher_id !== publisherId) return null;
    return { id: data.id };
}

/** Parse + structurally validate the wallet-address batch. */
function parseWallets(raw: unknown):
    | { ok: true; hashes: string[] }
    | { ok: false; response: NextResponse } {
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
        return {
            ok: false,
            response: apiError("VALIDATION_ERROR", "Invalid request body", 400, {
                fields: parsed.error.flatten().fieldErrors,
            }),
        };
    }
    const invalid = parsed.data.walletAddresses.filter((w) => !isValidSolanaAddress(w));
    if (invalid.length > 0) {
        return {
            ok: false,
            response: apiError("INVALID_WALLET_ADDRESS", "One or more wallet addresses are invalid", 400, {
                invalid,
            }),
        };
    }
    const unique = Array.from(new Set(parsed.data.walletAddresses));
    return { ok: true, hashes: unique.map((w) => hashWalletAddress(w)) };
}

/**
 * POST /api/v1/beta/tester-groups/[groupId]/members
 *
 * Body: { walletAddresses: string[] } (max 50/call). Adds wallets to the group
 * (hashed; plaintext never stored). There is NO size cap on a group — the
 * 200-tester cap is per-track and enforced at attach time, so a group may
 * legitimately exceed 200 and fan out across tracks.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { groupId } = await params;
    if (!isValidUuid(groupId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = parseWallets(raw);
    if (!parsed.ok) return parsed.response;

    const admin = createSupabaseAdminClient();
    const group = await loadOwnedGroup(admin, groupId, auth.publisher.id);
    if (!group) return notFound();

    // Skip wallets already in the group; insert the rest in one batch.
    const { data: existingRows } = await admin
        .from("tester_group_members")
        .select("wallet_hash")
        .eq("group_id", groupId)
        .in("wallet_hash", parsed.hashes);
    const existing = new Set((existingRows ?? []).map((r) => r.wallet_hash));
    const toInsert = parsed.hashes.filter((h) => !existing.has(h));

    if (toInsert.length > 0) {
        const { error } = await admin.from("tester_group_members").insert(
            toInsert.map((hash) => ({
                group_id: groupId,
                wallet_hash: hash,
                added_by_publisher_id: auth.publisher.id,
            })),
        );
        if (error) return apiError("DB_ERROR", "Failed to add group members", 500);
    }

    return NextResponse.json({ added: toInsert.length, skipped: existing.size }, { status: 201 });
}

/**
 * DELETE /api/v1/beta/tester-groups/[groupId]/members
 *
 * Body: { walletAddresses: string[] }. Removes wallets from the group. This is
 * the first tester-removal primitive in the system; it affects the GROUP only —
 * tracks already filled from the group (snapshot model) are unaffected.
 */
export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
    const { groupId } = await params;
    if (!isValidUuid(groupId)) return notFound();

    const auth = await requireVerifiedPublisher();
    if (auth.status === "unauthenticated") return notFound();
    if (auth.status === "not_publisher" || auth.status === "kyc_required") return notFound();

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = parseWallets(raw);
    if (!parsed.ok) return parsed.response;

    const admin = createSupabaseAdminClient();
    const group = await loadOwnedGroup(admin, groupId, auth.publisher.id);
    if (!group) return notFound();

    const { data: removed, error } = await admin
        .from("tester_group_members")
        .delete()
        .eq("group_id", groupId)
        .in("wallet_hash", parsed.hashes)
        .select("id");

    if (error) return apiError("DB_ERROR", "Failed to remove group members", 500);

    return NextResponse.json({ removed: (removed ?? []).length });
}
