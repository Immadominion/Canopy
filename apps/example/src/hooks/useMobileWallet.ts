/**
 * useMobileWallet — connects to a Solana Mobile wallet via MWA and registers
 * the wallet address with Canopy using identify().
 *
 * Uses useCanopyTransact() instead of MWA's transact() directly, so that
 * mwa_session_start / mwa_wallet_connected / mwa_session_end events are
 * emitted automatically.
 *
 * @example
 * ```tsx
 * const { publicKey, connect, disconnect, connecting } = useMobileWallet();
 * ```
 */
import { useState } from "react";
import { useCanopy, useCanopyTransact } from "@canopy/react-native";

/**
 * Converts a raw 32-byte public key (Uint8Array) returned by MWA authorize()
 * to its base58 string representation without adding the `bs58` dependency.
 *
 * In production apps, prefer `import bs58 from "bs58"` for standard encoding.
 * This implementation is kept dependency-free for the example only.
 */
function uint8ArrayToBase58(bytes: Uint8Array): string {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let num = BigInt(0);
    for (const byte of bytes) {
        num = num * BigInt(256) + BigInt(byte);
    }
    let encoded = "";
    while (num > BigInt(0)) {
        encoded = ALPHABET[Number(num % BigInt(58))] + encoded;
        num = num / BigInt(58);
    }
    for (const byte of bytes) {
        if (byte !== 0) break;
        encoded = "1" + encoded;
    }
    return encoded;
}

export interface UseMobileWalletReturn {
    /** Base58-encoded public key of the connected wallet, or null if not connected. */
    publicKey: string | null;
    /** Initiates a wallet connection via MWA. */
    connect: () => Promise<void>;
    /** Clears the stored public key (local only — does not deauthorize the wallet). */
    disconnect: () => void;
    /** True while a transact() session is in progress. */
    connecting: boolean;
}

export function useMobileWallet(): UseMobileWalletReturn {
    const canopyTransact = useCanopyTransact();
    const { identify } = useCanopy();

    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);

    const connect = async (): Promise<void> => {
        if (connecting) return;
        setConnecting(true);

        try {
            await canopyTransact(async (wallet) => {
                // wallet.authorize() opens the wallet's bottom sheet for connection.
                // It returns an AuthorizationResult with accounts[].address (Uint8Array).
                const auth = await wallet.authorize({
                    chain: "solana:mainnet",
                    identity: {
                        name: "Canopy Demo App",
                        uri: "https://example.canopy.app",
                        icon: "/favicon.ico",
                    },
                });

                const firstAccount = auth.accounts[0];

                // MWA 2.x returns Account.address as Base64EncodedAddress (string).
                // Decode to raw bytes before converting to base58.
                const addressBytes = Uint8Array.from(
                    atob(firstAccount.address),
                    (c) => c.charCodeAt(0),
                );

                // Convert the raw 32-byte public key to a base58 address string.
                // This is the canonical Solana wallet address format.
                const base58Address = uint8ArrayToBase58(addressBytes);

                // identify() SHA-256 hashes the address on-device before storing.
                // The plaintext address never leaves the device.
                await identify(base58Address);
                setPublicKey(base58Address);
            });
        } catch {
            // transact() throws if the user cancels or the wallet is unavailable.
            // Silently ignore — the UI will remain in the disconnected state.
        } finally {
            setConnecting(false);
        }
    };

    const disconnect = (): void => {
        setPublicKey(null);
    };

    return { publicKey, connect, disconnect, connecting };
}
