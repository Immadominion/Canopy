"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import {
    createTransferInstruction,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

type Status = "idle" | "paying" | "confirming" | "error" | "done";

interface Props {
    plan: "pro" | "enterprise";
    interval: "monthly" | "annual";
    priceUsd: number;
    merchantWallet: string;
    usdcMint: string;
    rpcUrl: string;
}

/**
 * Pay-to-extend: send a one-time USDC transfer to the merchant wallet with the
 * connected wallet, then ask the server to verify it on-chain and extend the
 * plan. No program, no recurring pull.
 */
export function SubscribeWithUsdc({
    plan,
    interval,
    priceUsd,
    merchantWallet,
    usdcMint,
    rpcUrl,
}: Props) {
    const router = useRouter();
    const { publicKey, sendTransaction } = useWallet();
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState("");

    const connection = useMemo(() => new Connection(rpcUrl, "confirmed"), [rpcUrl]);

    async function handlePay() {
        if (!publicKey) {
            setError("CONNECT_WALLET");
            setStatus("error");
            return;
        }
        setError("");
        setStatus("paying");
        try {
            const mint = new PublicKey(usdcMint);
            const merchant = new PublicKey(merchantWallet);
            const source = getAssociatedTokenAddressSync(mint, publicKey);
            const destination = getAssociatedTokenAddressSync(mint, merchant);
            const amount = BigInt(priceUsd) * 1_000_000n; // USDC, 6 decimals

            const ix = createTransferInstruction(source, destination, publicKey, amount);
            const tx = new Transaction().add(ix);
            tx.feePayer = publicKey;
            tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

            const signature = await sendTransaction(tx, connection);

            setStatus("confirming");
            await connection.confirmTransaction(signature, "confirmed");

            const res = await fetch("/api/v1/billing/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan, interval, signature }),
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as {
                    error?: { code?: string };
                };
                setError(data?.error?.code ?? "VERIFY_FAILED");
                setStatus("error");
                return;
            }
            setStatus("done");
            router.refresh();
        } catch {
            // Wallet rejected, insufficient USDC, or RPC error.
            setError("PAYMENT_FAILED");
            setStatus("error");
        }
    }

    const busy = status === "paying" || status === "confirming";

    return (
        <div>
            <button
                onClick={() => void handlePay()}
                disabled={busy}
                className="font-mono text-nd-label text-nd-black bg-nd-text-display uppercase tracking-[0.08em] px-nd-lg py-nd-sm rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
                {status === "paying"
                    ? "[ APPROVE IN WALLET... ]"
                    : status === "confirming"
                      ? "[ CONFIRMING... ]"
                      : `PAY ${priceUsd} USDC →`}
            </button>
            {status === "error" && (
                <p className="mt-nd-sm font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em]">
                    [ {error} ]
                </p>
            )}
        </div>
    );
}
