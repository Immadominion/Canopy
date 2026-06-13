"use client";

import { WalletProvider } from "@solana/wallet-adapter-react";
import {
    SolanaMobileWalletAdapter,
    createDefaultAddressSelector,
    createDefaultAuthorizationResultCache,
    createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";
import { useMemo } from "react";

/**
 * Client-side wrapper providing the Solana wallet context.
 *
 * Two ways a wallet reaches this app, no hardcoded button list:
 *
 *  1. Browser-extension wallets (Phantom, Solflare, Backpack, …) auto-register
 *     through the Wallet Standard the moment their extension is present. We do
 *     NOT instantiate adapters for them — doing so double-registers each wallet
 *     (that was the "can be removed from your app" console warning).
 *
 *  2. Mobile Wallet Adapter (MWA) — the native path for Solana Mobile. On a
 *     Seeker / Android device a developer signs in with their on-device wallet
 *     (Seed Vault) over the MWA protocol. We only register it on Android so a
 *     desktop user is never shown a dead "Mobile Wallet Adapter" button.
 *
 * The sign-in UI then renders one button per *detected* wallet — see
 * SIWSWalletConnect. autoConnect is off: signing in is an explicit action.
 */
export function WalletProviderWrapper({ children }: { children: React.ReactNode }) {
    const wallets = useMemo(() => {
        const isAndroid =
            typeof window !== "undefined" && /android/i.test(navigator.userAgent);

        if (!isAndroid) return [];

        return [
            new SolanaMobileWalletAdapter({
                addressSelector: createDefaultAddressSelector(),
                appIdentity: {
                    name: "Canopy",
                    uri: window.location.origin,
                },
                authorizationResultCache: createDefaultAuthorizationResultCache(),
                chain: "solana:mainnet",
                onWalletNotFound: createDefaultWalletNotFoundHandler(),
            }),
        ];
    }, []);

    return (
        <WalletProvider wallets={wallets} autoConnect={false}>
            {children}
        </WalletProvider>
    );
}
