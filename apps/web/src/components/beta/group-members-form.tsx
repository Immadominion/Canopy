"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Add or remove tester wallets in a group — client component.
 *
 * Wallets are stored as SHA-256 hashes (never plaintext), so a member can't be
 * shown back as an address; removal is by re-pasting the address. One input,
 * two actions: ADD (POST .../members) and REMOVE (DELETE .../members).
 */
export function GroupMembersForm({ groupId }: { groupId: string }) {
    const router = useRouter();
    const [rawInput, setRawInput] = useState("");
    const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
    const [errorCode, setErrorCode] = useState("");
    const [result, setResult] = useState("");

    async function submit(method: "POST" | "DELETE") {
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
        setResult("");
        try {
            const res = await fetch(`/api/v1/beta/tester-groups/${groupId}/members`, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddresses: addresses }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: { code?: string } };
                setErrorCode(data.error?.code ?? "REQUEST_FAILED");
                setStatus("error");
                return;
            }
            const data = (await res.json()) as { added?: number; removed?: number };
            setResult(
                method === "POST"
                    ? `ADDED ${String(data.added ?? 0)}`
                    : `REMOVED ${String(data.removed ?? 0)}`,
            );
            setRawInput("");
            setStatus("idle");
            router.refresh();
        } catch {
            setErrorCode("NETWORK_ERROR");
            setStatus("error");
        }
    }

    const busy = status === "submitting";

    return (
        <div>
            <label
                htmlFor="group-wallets"
                className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs block"
            >
                WALLET ADDRESSES — COMMA OR LINE SEPARATED (MAX 50)
            </label>
            <textarea
                id="group-wallets"
                className="w-full bg-transparent border border-nd-border focus:border-nd-border-visible outline-none font-mono text-nd-caption text-nd-text-primary px-nd-md py-nd-sm resize-none min-h-[100px] placeholder:text-nd-text-disabled transition-colors mb-nd-lg"
                placeholder="Dez7...abc1&#10;8xKm...yz34"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                disabled={busy}
            />

            {status === "error" && errorCode && (
                <p className="font-mono text-nd-body text-nd-accent mb-nd-lg">[ ERROR: {errorCode} ]</p>
            )}
            {result && (
                <p className="font-mono text-nd-body text-nd-text-secondary mb-nd-lg">[ {result} ]</p>
            )}

            <div className="flex gap-nd-md">
                <button
                    type="button"
                    onClick={() => void submit("POST")}
                    disabled={busy}
                    className="font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-xl py-nd-sm hover:border-nd-border-visible transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {busy ? "[ WORKING... ]" : "ADD →"}
                </button>
                <button
                    type="button"
                    onClick={() => void submit("DELETE")}
                    disabled={busy}
                    className="font-mono text-nd-label text-nd-accent uppercase tracking-[0.08em] border border-nd-border px-nd-xl py-nd-sm hover:border-nd-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    REMOVE
                </button>
            </div>
        </div>
    );
}
