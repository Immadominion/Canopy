/**
 * useCanopyTransact — wraps Mobile Wallet Adapter's `transact()` with automatic
 * analytics event tracking.
 *
 * Since MWA has no passive lifecycle listener (it is request/response via
 * `transact()`), the SDK must wrap `transact()` to capture wallet events.
 *
 * Emits:
 * - `mwa_session_start`    — before the wallet bottom sheet opens
 * - `mwa_session_end`      — after the session completes (success or failure)
 * - `mwa_transaction_signed` — when the user approves a transaction
 * - `mwa_transaction_declined` — when the user declines / cancels
 * - `mwa_wallet_connected` — on first successful wallet connection
 *
 * Requires `@solana-mobile/mobile-wallet-adapter-protocol` as a peer dependency.
 *
 * @example
 * ```tsx
 * const canopyTransact = useCanopyTransact();
 *
 * // Use canopyTransact instead of transact() from MWA
 * await canopyTransact(async (wallet) => {
 *   const { publicKey } = await wallet.authorize({ ... });
 *   // ...
 * });
 * ```
 */
import { useCallback } from "react";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol";
import type { MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol";
import { useCanopyContext } from "../context/CanopyProvider";
import { generateId } from "../id";
import type { CanopyEvent } from "@canopy/types";

type TransactCallback<T> = (wallet: MobileWallet) => Promise<T>;

export function useCanopyTransact(): <T>(cb: TransactCallback<T>) => Promise<T> {
    const { config, walletHash, sessionId, enqueue } = useCanopyContext();

    const canopyTransact = useCallback(
        async <T>(cb: TransactCallback<T>): Promise<T> => {
            const baseEvent = {
                walletHash: walletHash ?? "",
                sessionId,
                properties: null,
                sdkVersion: "0.1.0",
                appVersion: config.appVersion ?? null,
                platform: "android",
                isSeeker: null,
                hasGenesisToken: null,
                skrBalanceTier: null,
            } satisfies Omit<CanopyEvent, "id" | "name" | "timestamp">;

            enqueue({
                ...baseEvent,
                id: generateId(),
                name: "mwa_session_start",
                timestamp: new Date().toISOString(),
            });

            try {
                const result = await transact(async (wallet: MobileWallet) => {
                    const value = await cb(wallet);

                    enqueue({
                        ...baseEvent,
                        id: generateId(),
                        name: "mwa_transaction_signed",
                        timestamp: new Date().toISOString(),
                    });

                    return value;
                });

                enqueue({
                    ...baseEvent,
                    id: generateId(),
                    name: "mwa_session_end",
                    properties: { success: true },
                    timestamp: new Date().toISOString(),
                });

                return result;
            } catch (err) {
                const isUserCancel =
                    err instanceof Error &&
                    (err.message.includes("declined") ||
                        err.message.includes("cancelled") ||
                        err.message.includes("canceled"));

                enqueue({
                    ...baseEvent,
                    id: generateId(),
                    name: isUserCancel ? "mwa_transaction_declined" : "mwa_session_end",
                    properties: {
                        success: false,
                        reason: isUserCancel ? "user_declined" : "error",
                    },
                    timestamp: new Date().toISOString(),
                });

                throw err;
            }
        },
        [config.appVersion, enqueue, sessionId, walletHash],
    );

    return canopyTransact;
}
