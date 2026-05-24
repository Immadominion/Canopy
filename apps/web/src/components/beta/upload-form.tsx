"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type FormStatus = "idle" | "uploading" | "error";

interface Props {
    appId: string;
}

export function UploadForm({ appId }: Props) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);

    const [status, setStatus] = useState<FormStatus>("idle");
    const [errorCode, setErrorCode] = useState<string>("");
    const [versionName, setVersionName] = useState("");
    const [versionCode, setVersionCode] = useState("");
    const [expiresInDays, setExpiresInDays] = useState("30");
    const [releaseNotes, setReleaseNotes] = useState("");
    const [fileName, setFileName] = useState<string>("");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setErrorCode("");

        const file = fileRef.current?.files?.[0];
        if (!file) {
            setErrorCode("NO_FILE");
            setStatus("error");
            return;
        }
        if (!file.name.endsWith(".apk")) {
            setErrorCode("INVALID_FILE_TYPE");
            setStatus("error");
            return;
        }
        if (!versionName.trim()) {
            setErrorCode("VERSION_NAME_REQUIRED");
            setStatus("error");
            return;
        }
        const vc = parseInt(versionCode, 10);
        if (!Number.isInteger(vc) || vc <= 0) {
            setErrorCode("INVALID_VERSION_CODE");
            setStatus("error");
            return;
        }
        const days = parseInt(expiresInDays, 10);
        if (!Number.isInteger(days) || days < 1 || days > 30) {
            setErrorCode("INVALID_EXPIRY");
            setStatus("error");
            return;
        }

        setStatus("uploading");

        const form = new FormData();
        form.append("apk", file);
        form.append("appId", appId);
        form.append("versionName", versionName.trim());
        form.append("versionCode", String(vc));
        form.append("expiresInDays", String(days));
        if (releaseNotes.trim()) {
            form.append("releaseNotes", releaseNotes.trim());
        }

        try {
            const res = await fetch("/api/v1/beta/upload", {
                method: "POST",
                body: form,
            });

            if (!res.ok) {
                const data = (await res.json()) as { error?: { code?: string } };
                setErrorCode(data.error?.code ?? "UPLOAD_FAILED");
                setStatus("error");
                return;
            }

            const data = (await res.json()) as { trackId: string };
            router.push(`/dashboard/apps/${appId}/tracks/${data.trackId}`);
        } catch {
            setErrorCode("NETWORK_ERROR");
            setStatus("error");
        }
    }

    const inputClass =
        "w-full bg-transparent border-b border-nd-border focus:border-nd-border-visible outline-none font-mono text-nd-body text-nd-text-primary py-nd-sm placeholder:text-nd-text-disabled transition-colors";

    const labelClass =
        "font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-2xs block";

    return (
        <form onSubmit={handleSubmit} className="max-w-lg">
            {/* ── APK File ── */}
            <div className="mb-nd-xl">
                <label className={labelClass}>APK FILE</label>
                <div
                    className="border border-nd-border px-nd-lg py-nd-md cursor-pointer hover:border-nd-border-visible transition-colors"
                    onClick={() => fileRef.current?.click()}
                >
                    <p className="font-mono text-nd-body text-nd-text-secondary">
                        {fileName || "[ SELECT .APK FILE ]"}
                    </p>
                    {fileName && (
                        <p className="font-mono text-nd-caption text-nd-text-disabled mt-nd-2xs">
                            {fileName}
                        </p>
                    )}
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".apk"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setFileName(f.name);
                    }}
                />
            </div>

            {/* ── Version Name ── */}
            <div className="mb-nd-xl">
                <label htmlFor="version-name" className={labelClass}>
                    VERSION NAME
                </label>
                <input
                    id="version-name"
                    type="text"
                    className={inputClass}
                    placeholder="e.g. 1.2.3"
                    maxLength={64}
                    value={versionName}
                    onChange={(e) => setVersionName(e.target.value)}
                    disabled={status === "uploading"}
                    autoComplete="off"
                />
            </div>

            {/* ── Version Code ── */}
            <div className="mb-nd-xl">
                <label htmlFor="version-code" className={labelClass}>
                    VERSION CODE
                </label>
                <input
                    id="version-code"
                    type="text"
                    inputMode="numeric"
                    className={inputClass}
                    placeholder="e.g. 123 (integer)"
                    value={versionCode}
                    onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, ""))}
                    disabled={status === "uploading"}
                    autoComplete="off"
                />
            </div>

            {/* ── Expiry ── */}
            <div className="mb-nd-xl">
                <label htmlFor="expires-in-days" className={labelClass}>
                    EXPIRES IN (DAYS) — MAX 30
                </label>
                <input
                    id="expires-in-days"
                    type="text"
                    inputMode="numeric"
                    className={inputClass}
                    placeholder="30"
                    value={expiresInDays}
                    onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setExpiresInDays(val);
                    }}
                    disabled={status === "uploading"}
                    autoComplete="off"
                />
            </div>

            {/* ── Release Notes (optional) ── */}
            <div className="mb-nd-2xl">
                <label htmlFor="release-notes" className={labelClass}>
                    RELEASE NOTES{" "}
                    <span className="text-nd-text-disabled normal-case tracking-normal">
                        (optional)
                    </span>
                </label>
                <textarea
                    id="release-notes"
                    className={`${inputClass} resize-none min-h-[80px]`}
                    placeholder="What changed in this build?"
                    maxLength={2000}
                    value={releaseNotes}
                    onChange={(e) => setReleaseNotes(e.target.value)}
                    disabled={status === "uploading"}
                />
            </div>

            {/* ── Error ── */}
            {status === "error" && errorCode && (
                <p className="font-mono text-nd-body text-nd-accent mb-nd-lg">
                    [ ERROR: {errorCode} ]
                </p>
            )}

            {/* ── Actions ── */}
            <div className="flex items-center gap-nd-xl">
                <button
                    type="submit"
                    disabled={status === "uploading"}
                    className="font-mono text-nd-label text-nd-text-display uppercase tracking-[0.08em] border border-nd-border px-nd-xl py-nd-sm hover:border-nd-border-visible transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {status === "uploading" ? "[ UPLOADING... ]" : "UPLOAD BUILD →"}
                </button>

                {status !== "uploading" && (
                    <a
                        href={`/dashboard/apps/${appId}`}
                        className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                    >
                        CANCEL
                    </a>
                )}
            </div>
        </form>
    );
}
