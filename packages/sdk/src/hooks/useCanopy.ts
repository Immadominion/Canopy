/**
 * useCanopy — main SDK hook for tracking events and identifying wallets.
 *
 * @example
 * ```tsx
 * const { track, identify } = useCanopy();
 *
 * // Track an event
 * track('button_click', { label: 'swap' });
 *
 * // Identify the connected wallet (hash is computed on device)
 * await identify(walletPublicKey.toBase58());
 * ```
 */
import { useCallback } from "react";
import type { CanopyEvent } from "@canopy/types";
import { useCanopyContext } from "../context/CanopyProvider";
import { hashWalletAddress } from "../hash";
import { generateId } from "../id";

export interface UseCanopyReturn {
    /**
     * Track a named event with optional properties.
     * The event is queued locally and flushed to ingest in the background.
     */
    track: (name: string, properties?: Record<string, unknown>) => void;

    /**
     * Identify the connected wallet. Hashes the address on-device (SHA-256)
     * before storing — the plaintext address never leaves the device.
     *
     * Call this after a successful wallet connection.
     */
    identify: (walletAddress: string) => Promise<void>;
}

export function useCanopy(): UseCanopyReturn {
    const { config, walletHash, sessionId, setWalletHash, enqueue } =
        useCanopyContext();

    const track = useCallback(
        (name: string, properties?: Record<string, unknown>): void => {
            const event: CanopyEvent = {
                id: generateId(),
                name,
                walletHash: walletHash ?? "",
                sessionId,
                properties: properties ?? null,
                sdkVersion: "0.1.0",
                appVersion: config.appVersion ?? null,
                platform: "android",
                isSeeker: null,
                hasGenesisToken: null,
                skrBalanceTier: null,
                timestamp: new Date().toISOString(),
            };
            enqueue(event);
        },
        [config.appVersion, enqueue, sessionId, walletHash],
    );

    const identify = useCallback(
        async (walletAddress: string): Promise<void> => {
            try {
                const hash = await hashWalletAddress(walletAddress);
                setWalletHash(hash);
                // Track the wallet_connected event with the freshly computed hash
                const event: CanopyEvent = {
                    id: generateId(),
                    name: "wallet_connected",
                    walletHash: hash,
                    sessionId,
                    properties: null,
                    sdkVersion: "0.1.0",
                    appVersion: config.appVersion ?? null,
                    platform: "android",
                    isSeeker: null,
                    hasGenesisToken: null,
                    skrBalanceTier: null,
                    timestamp: new Date().toISOString(),
                };
                enqueue(event);
            } catch {
                // Silently discard — SDK must not crash host app
            }
        },
        [config.appVersion, enqueue, sessionId, setWalletHash],
    );

    return { track, identify };
}
