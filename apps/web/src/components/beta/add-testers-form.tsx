"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
    trackId: string;
    testerCount: number;
    testerCap: number;
    trackStatus: string;
    trackExpired: boolean;
}

/**
 * Add testers to a beta track — client component.
 *
 * Invariant 2 enforcement:
 *  - UI counter always shows N / 200
 *  - Form is disabled when testerCount >= testerCap (at limit)
 *  - Button shows [ AT LIMIT ] when at cap
 *
 * Input: comma- or newline-separated Solana wallet addresses.
 * API: POST /api/v1/beta/[trackId]/testers with { walletAddresses: string[] }
 */
export function AddTestersForm({ trackId, testerCount, testerCap, trackStatus, trackExpired }: Props) {
    const router = useRouter();
    const [rawInput, setRawInput] = useState("");
    const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
    const [errorCode, setErrorCode] = useState("");

    const atLimit = testerCount >= testerCap;
    const canAdd = !atLimit && trackStatus === "active" && !trackExpired;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!canAdd) return;

        const addresses = rawInput
            .split(/[\s,\n]+/)
            .map((a) => a.trim())
            .filter(Boolean);

        if (addresses.length === 0) {
            setErrorCode("NO_ADDRESSES");
            setStatus("error");
            return;
        }
        if (addresses.length > 50) {
            setErrorCode("MAX_50_PER_CALL");
            setStatus("error");
            return;
        }

        setStatus("submitting");
        setErrorCode("");

        try {
            const res = await fetch(`/api/v1/beta/${trackId}/testers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddresses: addresses }),
            });

            if (!res.ok) {
                const data = (await res.json()) as { error?: { code?: string } };
                setErrorCode(data.error?.code ?? "ADD_FAILED");
                setStatus("error");
                return;
            }

            setRawInput("");
            setStatus("idle");
            router.refresh();
        } catch {
            setErrorCode("NETWORK_ERROR");
            setStatus("error");
        }
    }

    return (
        <div>
            {/* ── Tester counter — always visible (Invariant 2) ── */}
            <div className="flex items-baseline gap-nd-sm mb-nd-lg">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                    TESTERS
                </p>
                <p className="font-mono text-nd-body text-nd-text-display">
                    {testerCount}{" "}
                    <span className="text-nd-text-secondary">/ {testerCap}</span>
                </p>
                {atLimit && (
                    <p className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em]">
                        AT LIMIT
                    </p>
                )}
            </div>

            {/* ── Add testers form ── */}
            {!canAdd ? (
                <p className="font-mono text-nd-caption text-nd-text-disabled">
                    {atLimit
                        ? "[ TESTER CAP REACHED — CANNOT ADD MORE ]"
                        : trackExpired
                            ? "[ TRACK EXPIRED ]"
                            : "[ ACTIVATE TRACK TO ADD TESTERS ]"}
                </p>
            ) : (
                <form onSubmit={handleSubmit}>
                    <label
                        htmlFor="wallet-addresses"
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs block"
                    >
                        WALLET ADDRESSES — COMMA OR LINE SEPARATED (MAX 50)
                    </label>
                    <textarea
                        id="wallet-addresses"
                        className="w-full bg-transparent border border-nd-border focus:border-nd-border-visible outline-none font-mono text-nd-caption text-nd-text-primary px-nd-md py-nd-sm resize-none min-h-[100px] placeholder:text-nd-text-disabled transition-colors mb-nd-lg"
                        placeholder="Dez7...abc1&#10;8xKm...yz34"
                        value={rawInput}
                        onChange={(e) => setRawInput(e.target.value)}
                        disabled={status === "submitting"}
                    />

                    {status === "error" && errorCode && (
                        <p className="font-mono text-nd-body text-nd-accent mb-nd-lg">
                            [ ERROR: {errorCode} ]
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={status === "submitting" || atLimit}
                        className="font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-xl py-nd-sm hover:border-nd-border-visible transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {status === "submitting" ? "[ ADDING... ]" : atLimit ? "[ AT LIMIT ]" : "ADD TESTERS →"}
                    </button>
                </form>
            )}
        </div>
    );
}
