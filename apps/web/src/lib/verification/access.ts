import crypto from "crypto";

import { logger } from "@/lib/logger";
import { checkPublisherAppNft } from "@/lib/solana/publisher-verification";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { notifyAccessRequest } from "@/lib/telegram/client";

/**
 * Core logic for the manual publisher-access flow. Shared by the public
 * request endpoint, the admin decision endpoint, and the Telegram webhook so
 * the state transition lives in exactly one place.
 */

const log = logger.child({ module: "access-requests" });

/** Unambiguous alphabet (no 0/O/1/I/L) for human-readable codes. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(): string {
    const bytes = crypto.randomBytes(6);
    let out = "";
    for (let i = 0; i < 6; i++) out += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
    return out;
}

function shortWallet(address: string): string {
    return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

export type CreateAccessRequestResult =
    | { status: "created"; code: string; requestId: string }
    | { status: "already_pending"; code: string; requestId: string }
    | { status: "already_approved" }
    | { status: "error"; message: string };

/**
 * Create (or return the existing) access request for a publisher. Idempotent
 * per publisher while a request is pending — the partial unique index on
 * `access_requests (publisher_id) WHERE status='pending'` is the source of truth.
 */
export async function createAccessRequest(opts: {
    publisherId: string;
    walletHash: string;
    walletAddress: string;
    displayName: string;
    projectSummary: string;
    contactTelegram?: string | null;
}): Promise<CreateAccessRequestResult> {
    const admin = createSupabaseAdminClient();

    const { data: pub } = await admin
        .from("publishers")
        .select("verification_status")
        .eq("id", opts.publisherId)
        .maybeSingle();

    if (pub?.verification_status === "approved") return { status: "already_approved" };
    if (pub?.verification_status === "banned") return { status: "error", message: "BANNED" };

    const { data: existing } = await admin
        .from("access_requests")
        .select("id, code")
        .eq("publisher_id", opts.publisherId)
        .eq("status", "pending")
        .maybeSingle();

    if (existing) {
        return { status: "already_pending", code: existing.code, requestId: existing.id };
    }

    // Best-effort on-chain signal snapshot. Currently returns null until the
    // dApp Store App-NFT collection address is confirmed (see
    // publisher-verification.ts) — recorded as "unknown", never blocking.
    let onchain: boolean | null = null;
    try {
        onchain = await checkPublisherAppNft(opts.walletAddress);
    } catch {
        onchain = null;
    }

    const code = generateCode();
    const { data, error } = await admin
        .from("access_requests")
        .insert({
            publisher_id: opts.publisherId,
            wallet_hash: opts.walletHash,
            display_name: opts.displayName,
            project_summary: opts.projectSummary,
            contact_telegram: opts.contactTelegram ?? null,
            code,
            onchain_app_nft: onchain,
        })
        .select("id, code")
        .single();

    if (error || !data) {
        // 23505 = a pending request was created concurrently; return it.
        if (error?.code === "23505") {
            const { data: race } = await admin
                .from("access_requests")
                .select("id, code")
                .eq("publisher_id", opts.publisherId)
                .eq("status", "pending")
                .maybeSingle();
            if (race) return { status: "already_pending", code: race.code, requestId: race.id };
        }
        log.warn({ error }, "Failed to create access request");
        return { status: "error", message: "DB_ERROR" };
    }

    // Move to pending from either a fresh (unverified) or previously-rejected
    // state. `banned` is the permanent block (handled above) and `approved`
    // short-circuits earlier — neither is clobbered here.
    await admin
        .from("publishers")
        .update({ verification_status: "pending" })
        .eq("id", opts.publisherId)
        .in("verification_status", ["unverified", "rejected"]);

    // Fire-and-forget founder notification (non-fatal).
    void notifyAccessRequest({
        requestId: data.id,
        code: data.code,
        displayName: opts.displayName,
        projectSummary: opts.projectSummary,
        walletShort: shortWallet(opts.walletAddress),
        contactTelegram: opts.contactTelegram ?? null,
        onchainAppNft: onchain,
    });

    return { status: "created", code: data.code, requestId: data.id };
}

export type Decision = "approve" | "reject";

export type DecideResult =
    | { ok: true; publisherId: string; alreadyDecided: boolean; displayName: string }
    | { ok: false; reason: "not_found" };

/**
 * Apply an approve/reject decision. Idempotent: a request already decided
 * returns alreadyDecided=true without changing state. Approval flips the
 * publisher to `approved` AND sets kyc_verified=true so the existing
 * requireVerifiedPublisher gate unlocks unchanged.
 */
export async function decideAccessRequest(opts: {
    requestId: string;
    decision: Decision;
    decidedBy: string;
}): Promise<DecideResult> {
    const admin = createSupabaseAdminClient();

    const { data: req } = await admin
        .from("access_requests")
        .select("id, publisher_id, status, display_name")
        .eq("id", opts.requestId)
        .maybeSingle();

    if (!req) return { ok: false, reason: "not_found" };
    if (req.status !== "pending") {
        return {
            ok: true,
            publisherId: req.publisher_id,
            alreadyDecided: true,
            displayName: req.display_name,
        };
    }

    const nowIso = new Date().toISOString();
    const newStatus = opts.decision === "approve" ? "approved" : "rejected";

    // Atomically claim the request: only the call that flips it out of 'pending'
    // proceeds to touch the publisher row. A concurrent conflicting decision
    // updates 0 rows here and bails — preventing a last-write-wins clobber.
    const { data: claimed } = await admin
        .from("access_requests")
        .update({ status: newStatus, decided_at: nowIso, decided_by: opts.decidedBy })
        .eq("id", opts.requestId)
        .eq("status", "pending")
        .select("id");

    if (!claimed || claimed.length === 0) {
        return {
            ok: true,
            publisherId: req.publisher_id,
            alreadyDecided: true,
            displayName: req.display_name,
        };
    }

    if (opts.decision === "approve") {
        await admin
            .from("publishers")
            .update({
                verification_status: "approved",
                kyc_verified: true,
                kyc_verified_at: nowIso,
            })
            .eq("id", req.publisher_id)
            .eq("verification_status", "pending");
    } else {
        await admin
            .from("publishers")
            .update({ verification_status: "rejected" })
            .eq("id", req.publisher_id)
            .eq("verification_status", "pending");
    }

    log.info(
        { requestId: opts.requestId, decision: opts.decision, decidedBy: opts.decidedBy },
        "Access request decided",
    );

    return {
        ok: true,
        publisherId: req.publisher_id,
        alreadyDecided: false,
        displayName: req.display_name,
    };
}
