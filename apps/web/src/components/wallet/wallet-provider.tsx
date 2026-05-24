"use client";

import { WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo } from "react";

/**
 * Client-side wrapper that provides the Wallet Standard context.
 *
 * Phantom and Solflare are explicitly registered as fallback adapters.
 * All wallets that implement the Wallet Standard (Backpack, etc.) auto-register
 * when their extension is present — no explicit adapter needed.
 *
 * autoConnect is deliberately disabled: users must click to sign in.
 */
export function WalletProviderWrapper({ children }: { children: React.ReactNode }) {
    const wallets = useMemo(
        () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
        [],
    );

    return (
        <WalletProvider wallets={wallets} autoConnect={false}>
            {children}
        </WalletProvider>
    );
}
