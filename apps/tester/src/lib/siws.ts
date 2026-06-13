/**
 * useSiwsLogin — Sign-In-With-Solana on device.
 *
 * Flow: fetch a nonce → MWA authorize + signMessages over a SIWS message that
 * embeds the nonce → POST /api/v1/auth/verify?client=mobile → persist the
 * returned Supabase session tokens in secure storage. Mirrors the web flow in
 * apps/web/src/components/install/siws-install-flow.tsx.
 *
 * On-device behaviour (MWA signMessages payload shape, signature extraction)
 * must be verified on a real device in Phase 2.
 */
import { useCallback, useState } from "react";
import { useCanopy, useCanopyTransact } from "@canopy/react-native";

import { API_BASE_URL } from "./config";
import { base64ToBytes, bytesToBase64, toBase58 } from "./base58";
import { saveSession } from "./session";

export type SiwsStatus = "idle" | "connecting" | "signing" | "verifying" | "error";

/**
 * fetch with a hard timeout via AbortController (works in Hermes, unlike
 * AbortSignal.timeout). Turns an unreachable dev server into a fast, visible
 * error instead of an infinite spinner.
 */
async function fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    ms = 12000,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort();
    }, ms);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function buildSiwsMessage(opts: {
    domain: string;
    address: string;
    nonce: string;
    issuedAt: string;
    expiresAt: string;
}): string {
    return [
        `${opts.domain} wants you to sign in with your Solana account:`,
        opts.address,
        ``,
        `Sign in to Canopy — Developer Infrastructure for Solana Mobile`,
        ``,
        `URI: ${API_BASE_URL}`,
        `Version: 1`,
        `Nonce: ${opts.nonce}`,
        `Issued At: ${opts.issuedAt}`,
        `Expiration Time: ${opts.expiresAt}`,
    ].join("\n");
}

export interface UseSiwsLoginReturn {
    status: SiwsStatus;
    errorCode: string;
    login: () => Promise<boolean>;
}

export function useSiwsLogin(): UseSiwsLoginReturn {
    const canopyTransact = useCanopyTransact();
    const { identify } = useCanopy();
    const [status, setStatus] = useState<SiwsStatus>("idle");
    const [errorCode, setErrorCode] = useState("");

    const login = useCallback(async (): Promise<boolean> => {
        setStatus("connecting");
        setErrorCode("");

        try {
            // 1. Fresh single-use nonce.
            let nonceRes: Response;
            try {
                nonceRes = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/nonce`);
            } catch {
                // Reached when the device can't reach the dev server (firewall,
                // wrong IP, server not running, not on the same Wi-Fi).
                throw new Error(`CANT_REACH_API · ${API_BASE_URL}`);
            }
            if (!nonceRes.ok) throw new Error("NONCE_FETCH_FAILED");
            const { nonce } = (await nonceRes.json()) as { nonce: string };

            // 2. Authorize the wallet and sign the SIWS message.
            setStatus("signing");
            const signed = await canopyTransact(async (wallet) => {
                const auth = await wallet.authorize({
                    chain: "solana:mainnet",
                    identity: { name: "Canopy", uri: API_BASE_URL, icon: "favicon.ico" },
                });
                const account = auth.accounts[0];
                const base58Address = toBase58(base64ToBytes(account.address));

                const now = new Date();
                const expires = new Date(now.getTime() + 5 * 60 * 1000);
                const message = buildSiwsMessage({
                    domain: new URL(API_BASE_URL).host,
                    address: base58Address,
                    nonce,
                    issuedAt: now.toISOString(),
                    expiresAt: expires.toISOString(),
                });

                // MWA `signMessages` takes/returns BASE64 STRINGS (not Uint8Array).
                // Passing raw bytes corrupts the native bridge call ("malformed
                // calls from JS, field sizes are different"). Each signed payload
                // is the original message with the 64-byte signature appended.
                const messageBytes = new TextEncoder().encode(message);
                const messageB64 = bytesToBase64(messageBytes);

                const signResult = await (
                    wallet as unknown as {
                        signMessages(input: {
                            addresses: string[];
                            payloads: string[];
                        }): Promise<{ signed_payloads: string[] }>;
                    }
                ).signMessages({ addresses: [account.address], payloads: [messageB64] });

                const signedBytes = base64ToBytes(signResult.signed_payloads[0]);
                const signatureBytes = signedBytes.slice(signedBytes.length - 64);

                return { base58Address, message, signature: toBase58(signatureBytes) };
            });

            // 3. Verify server-side; ?client=mobile returns session tokens.
            setStatus("verifying");
            const verifyRes = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/verify?client=mobile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wallet: signed.base58Address,
                    signature: signed.signature,
                    message: signed.message,
                    nonce,
                }),
            });
            if (!verifyRes.ok) throw new Error("VERIFICATION_FAILED");

            const data = (await verifyRes.json()) as {
                session?: { accessToken: string; refreshToken: string; expiresAt: number | null };
            };
            if (!data.session) throw new Error("NO_SESSION");

            await saveSession({ ...data.session, walletAddress: signed.base58Address });
            await identify(signed.base58Address);
            setStatus("idle");
            return true;
        } catch (err) {
            setStatus("error");
            setErrorCode(err instanceof Error ? err.message : "LOGIN_FAILED");
            return false;
        }
    }, [canopyTransact, identify]);

    return { status, errorCode, login };
}
