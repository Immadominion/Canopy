import crypto from "crypto";

import { env } from "@/lib/env";

/**
 * APK download URL payload — signed with HMAC-SHA256.
 *
 * SECURITY INVARIANTS:
 * - A signed URL for wallet A MUST NOT work for wallet B (walletHash in payload).
 * - The R2 object key is NEVER exposed to the client — only the track UUID.
 *   The download endpoint resolves the key server-side from the track record.
 * - The download endpoint ALSO requires a session for the embedded wallet, so
 *   the URL is wallet-scoped (non-transferable), not a bearer token.
 * - Validity is 5 minutes — the client downloads immediately after issuance.
 */
export interface SignedUrlPayload {
    trackId: string;
    walletHash: string;
    issuedAt: number; // Unix timestamp ms
    expiresAt: number; // Unix timestamp ms
    nonce: string;
}

const SIGNED_URL_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generates a wallet-bound signed URL pointing at our own download endpoint.
 * The download endpoint validates the HMAC, looks up the R2 key, and streams the APK.
 */
export function generateSignedDownloadUrl(params: {
    trackId: string;
    walletHash: string;
    baseUrl: string; // e.g. https://canopy.dev or http://localhost:3000
}): { url: string; expiresAt: Date; nonce: string } {
    const now = Date.now();
    const expiresAt = now + SIGNED_URL_VALIDITY_MS;
    const nonce = crypto.randomBytes(16).toString("hex");

    const payload: SignedUrlPayload = {
        trackId: params.trackId,
        walletHash: params.walletHash,
        issuedAt: now,
        expiresAt,
        nonce,
    };

    const payloadStr = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadStr).toString("base64url");

    const signature = crypto
        .createHmac("sha256", env.R2_SIGNING_SECRET)
        .update(payloadB64)
        .digest("hex");

    const url = new URL(`/api/v1/beta/download/${params.trackId}`, params.baseUrl);
    url.searchParams.set("p", payloadB64);
    url.searchParams.set("sig", signature);

    return { url: url.toString(), expiresAt: new Date(expiresAt), nonce };
}

/**
 * Validates a signed download URL payload.
 * Returns the decoded payload if valid. Throws on tamper / expiry / mismatch.
 */
export function validateSignedDownloadUrl(params: {
    payloadB64: string;
    signature: string;
    expectedTrackId: string;
}): SignedUrlPayload {
    // 1. Verify HMAC (constant-time)
    const expectedSig = crypto
        .createHmac("sha256", env.R2_SIGNING_SECRET)
        .update(params.payloadB64)
        .digest("hex");

    const sigBuf = Buffer.from(params.signature, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        throw new Error("INVALID_SIGNATURE");
    }

    // 2. Decode payload
    let payload: SignedUrlPayload;
    try {
        const payloadStr = Buffer.from(params.payloadB64, "base64url").toString("utf8");
        payload = JSON.parse(payloadStr) as SignedUrlPayload;
    } catch {
        throw new Error("INVALID_PAYLOAD");
    }

    // 3. Cross-check trackId in URL path matches the signed payload
    if (payload.trackId !== params.expectedTrackId) {
        throw new Error("TRACK_ID_MISMATCH");
    }

    // 4. Check expiry
    if (Date.now() > payload.expiresAt) {
        throw new Error("URL_EXPIRED");
    }

    return payload;
}
