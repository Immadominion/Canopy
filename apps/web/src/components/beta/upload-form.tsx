"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { parseApkManifestClient } from "@/lib/apk/manifest-client";
import { UploadSimple, Package, X, WarningCircle } from "@phosphor-icons/react";

type Stage = "idle" | "uploading" | "finalizing" | "error";

interface Progress {
    loaded: number;
    total: number;
    pct: number;
    bytesPerSec: number;
    etaSec: number;
}

interface Props {
    appId: string;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

function formatEta(sec: number): string {
    if (!isFinite(sec) || sec <= 0) return "—";
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function UploadForm({ appId }: Props) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const xhrRef = useRef<XMLHttpRequest | null>(null);
    const speedRef = useRef(0);

    const [stage, setStage] = useState<Stage>("idle");
    const [errorCode, setErrorCode] = useState("");
    const [progress, setProgress] = useState<Progress | null>(null);

    const [versionName, setVersionName] = useState("");
    const [versionCode, setVersionCode] = useState("");
    const [expiresInDays, setExpiresInDays] = useState("30");
    const [releaseNotes, setReleaseNotes] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [detecting, setDetecting] = useState(false);
    const [detectedPackage, setDetectedPackage] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const busy = stage === "uploading" || stage === "finalizing";

    async function handleFileSelect(f: File) {
        if (!f.name.endsWith(".apk")) {
            setErrorCode("INVALID_FILE_TYPE");
            setStage("error");
            return;
        }
        setFile(f);
        setErrorCode("");
        if (stage === "error") setStage("idle");
        setDetectedPackage(null);
        setDetecting(true);
        try {
            const info = await parseApkManifestClient(f);
            if (info?.versionName) setVersionName(info.versionName);
            if (info?.versionCode != null) setVersionCode(String(info.versionCode));
            setDetectedPackage(info?.packageName ?? null);
        } finally {
            setDetecting(false);
        }
    }

    function clearFile() {
        setFile(null);
        setDetectedPackage(null);
        if (fileRef.current) fileRef.current.value = "";
    }

    // Step 3 — finalize: the server pulls the uploaded object back from R2,
    // validates + hashes it, and creates the track.
    async function finalizeUpload(uploadKey: string, days: number, vcTyped: string) {
        try {
            const res = await fetch("/api/v1/beta/upload/finalize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    appId,
                    uploadKey,
                    versionName: versionName.trim() || undefined,
                    versionCode: vcTyped || undefined,
                    expiresInDays: days,
                    releaseNotes: releaseNotes.trim() || undefined,
                }),
            });
            xhrRef.current = null;
            const data = (await res.json().catch(() => ({}))) as {
                trackId?: string;
                error?: { code?: string };
            };
            if (res.ok && data.trackId) {
                router.push(`/dashboard/apps/${appId}/tracks/${data.trackId}`);
            } else {
                setErrorCode(data.error?.code ?? `FINALIZE_HTTP_${String(res.status)}`);
                setStage("error");
            }
        } catch {
            setErrorCode("FINALIZE_FAILED");
            setStage("error");
        }
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setErrorCode("");

        if (!file) {
            setErrorCode("NO_FILE");
            setStage("error");
            return;
        }
        const vcTyped = versionCode.trim();
        if (vcTyped) {
            const n = parseInt(vcTyped, 10);
            if (!Number.isInteger(n) || n <= 0) {
                setErrorCode("INVALID_VERSION_CODE");
                setStage("error");
                return;
            }
        }
        const days = parseInt(expiresInDays, 10);
        if (!Number.isInteger(days) || days < 1 || days > 30) {
            setErrorCode("INVALID_EXPIRY");
            setStage("error");
            return;
        }

        setStage("uploading");
        setProgress({ loaded: 0, total: file.size, pct: 0, bytesPerSec: 0, etaSec: Infinity });

        // Step 1 — initiate: get a presigned URL to PUT the APK straight to R2,
        // so the bytes never pass through the function (no ~4.5MB body limit).
        let uploadUrl: string;
        let uploadKey: string;
        try {
            const res = await fetch("/api/v1/beta/upload/initiate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appId, size: file.size }),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
                setErrorCode(d.error?.code ?? `HTTP_${String(res.status)}`);
                setStage("error");
                return;
            }
            const d = (await res.json()) as { uploadUrl: string; uploadKey: string };
            uploadUrl = d.uploadUrl;
            uploadKey = d.uploadKey;
        } catch {
            setErrorCode("INITIATE_FAILED");
            setStage("error");
            return;
        }

        // Step 2 — PUT the bytes straight to R2, with real progress (XHR).
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        speedRef.current = 0;
        let lastLoaded = 0;
        let lastTime = Date.now();

        xhr.open("PUT", uploadUrl);

        xhr.upload.onprogress = (ev) => {
            if (!ev.lengthComputable) return;
            const now = Date.now();
            const dt = (now - lastTime) / 1000;
            if (dt > 0) {
                const inst = (ev.loaded - lastLoaded) / dt;
                speedRef.current = speedRef.current ? speedRef.current * 0.7 + inst * 0.3 : inst;
                lastLoaded = ev.loaded;
                lastTime = now;
            }
            const remaining = ev.total - ev.loaded;
            setProgress({
                loaded: ev.loaded,
                total: ev.total,
                pct: Math.round((ev.loaded / ev.total) * 100),
                bytesPerSec: speedRef.current,
                etaSec: speedRef.current > 0 ? remaining / speedRef.current : Infinity,
            });
        };

        // Bytes fully sent — the server now validates + records the build.
        xhr.upload.onload = () => setStage("finalizing");

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                xhrRef.current = null;
                setErrorCode(`UPLOAD_HTTP_${String(xhr.status)}`);
                setStage("error");
                return;
            }
            void finalizeUpload(uploadKey, days, vcTyped);
        };

        xhr.onerror = () => {
            xhrRef.current = null;
            setErrorCode("NETWORK_ERROR");
            setStage("error");
        };
        xhr.onabort = () => {
            xhrRef.current = null;
            setProgress(null);
            setStage("idle");
        };

        xhr.send(file);
    }

    function cancelUpload() {
        xhrRef.current?.abort();
    }

    return (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="max-w-xl">
            {/* ── Dropzone ── */}
            <div className="mb-nd-xl">
                <span className="field-label">APK file</span>
                {!file ? (
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const f = e.dataTransfer.files?.[0];
                            if (f) void handleFileSelect(f);
                        }}
                        className={`w-full flex flex-col items-center justify-center gap-nd-sm rounded-nd-card border border-dashed px-nd-lg py-nd-2xl transition-colors ${
                            dragOver
                                ? "border-nd-brand bg-nd-brand-subtle"
                                : "border-nd-border-visible bg-nd-surface hover:border-nd-text-disabled"
                        }`}
                    >
                        <UploadSimple size={28} className="text-nd-text-secondary" />
                        <span className="text-nd-body-sm text-nd-text-primary">
                            Drop your <span className="font-mono">.apk</span> here or click to browse
                        </span>
                        <span className="text-nd-caption text-nd-text-disabled">Up to 200 MB</span>
                    </button>
                ) : (
                    <div className="card flex items-center gap-nd-md p-nd-md">
                        <span className="flex items-center justify-center w-10 h-10 rounded-nd-card-compact bg-nd-brand-subtle text-nd-brand-hover shrink-0">
                            <Package size={20} weight="fill" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-nd-body-sm text-nd-text-primary truncate">{file.name}</p>
                            <p className="text-nd-caption text-nd-text-secondary mt-0.5 font-mono">
                                {formatBytes(file.size)}
                                {detecting
                                    ? " · reading manifest…"
                                    : detectedPackage
                                      ? ` · ${detectedPackage}`
                                      : ""}
                            </p>
                        </div>
                        {!busy && (
                            <button
                                type="button"
                                onClick={clearFile}
                                className="btn-ghost shrink-0"
                                aria-label="Remove file"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>
                )}
                <input
                    ref={fileRef}
                    type="file"
                    accept=".apk"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFileSelect(f);
                    }}
                />
            </div>

            {/* ── Progress ──
                Two honest phases:
                  • uploading  — real bytes sent (xhr.upload.onprogress): exact %, speed, ETA
                  • processing — bytes are sent; the server is hashing + storing to R2 +
                    starting the scan. There's no client-visible percentage for that, so
                    we show an indeterminate bar rather than a fake 100%. */}
            {busy && progress && (
                <div className="card p-nd-md mb-nd-xl">
                    {stage === "uploading" ? (
                        <>
                            <div className="flex items-center justify-between mb-nd-sm">
                                <span className="text-nd-body-sm font-medium text-nd-text-primary">
                                    Uploading…
                                </span>
                                <span className="font-mono text-nd-caption text-nd-brand-hover">
                                    {progress.pct}%
                                </span>
                            </div>
                            <div className="progress">
                                <div className="progress__bar" style={{ width: `${progress.pct}%` }} />
                            </div>
                            <div className="flex items-center justify-between mt-nd-sm font-mono text-nd-caption text-nd-text-secondary">
                                <span>
                                    {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                                </span>
                                <span>
                                    {formatBytes(progress.bytesPerSec)}/s · ETA {formatEta(progress.etaSec)}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mb-nd-sm">
                                <span className="text-nd-body-sm font-medium text-nd-text-primary">
                                    Processing on the server…
                                </span>
                            </div>
                            <div className="progress">
                                <div className="progress__bar--indeterminate" />
                            </div>
                            <p className="mt-nd-sm text-nd-caption text-nd-text-secondary leading-relaxed">
                                Upload complete. The server is hashing the APK, storing it, and
                                starting the malware scan — there&apos;s no exact percentage for this
                                step. The scan itself can take a few minutes for a brand-new build
                                while VirusTotal analyzes it; we&apos;ll take you to the build page
                                where it updates automatically.
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* ── Fields ── */}
            <fieldset disabled={busy} className="space-y-nd-xl border-0 p-0 m-0">
                <div>
                    <label htmlFor="version-name" className="field-label">
                        Version name{" "}
                        <span className="text-nd-text-disabled font-normal">
                            (read from the APK — edit to override)
                        </span>
                    </label>
                    <input
                        id="version-name"
                        type="text"
                        className="input font-mono"
                        placeholder="e.g. 1.2.3"
                        maxLength={64}
                        value={versionName}
                        onChange={(e) => setVersionName(e.target.value)}
                        autoComplete="off"
                    />
                </div>

                <div>
                    <label htmlFor="version-code" className="field-label">
                        Version code{" "}
                        <span className="text-nd-text-disabled font-normal">
                            (read from the APK — edit to override)
                        </span>
                    </label>
                    <input
                        id="version-code"
                        type="text"
                        inputMode="numeric"
                        className="input font-mono"
                        placeholder="e.g. 123"
                        value={versionCode}
                        onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, ""))}
                        autoComplete="off"
                    />
                </div>

                <div>
                    <label htmlFor="expires-in-days" className="field-label">
                        Expires in (days) — max 30
                    </label>
                    <input
                        id="expires-in-days"
                        type="text"
                        inputMode="numeric"
                        className="input font-mono"
                        placeholder="30"
                        value={expiresInDays}
                        onChange={(e) => setExpiresInDays(e.target.value.replace(/\D/g, ""))}
                        autoComplete="off"
                    />
                </div>

                <div>
                    <label htmlFor="release-notes" className="field-label">
                        Release notes{" "}
                        <span className="text-nd-text-disabled font-normal">(optional)</span>
                    </label>
                    <textarea
                        id="release-notes"
                        className="input min-h-[88px]"
                        placeholder="What changed in this build?"
                        maxLength={2000}
                        value={releaseNotes}
                        onChange={(e) => setReleaseNotes(e.target.value)}
                    />
                </div>
            </fieldset>

            {/* ── Error ── */}
            {stage === "error" && errorCode && (
                <div className="flex items-center gap-nd-sm mt-nd-lg text-nd-accent">
                    <WarningCircle size={18} weight="fill" />
                    <span className="text-nd-body-sm">{errorCode.replace(/_/g, " ").toLowerCase()}</span>
                </div>
            )}

            {/* ── Actions ── */}
            <div className="flex items-center gap-nd-md mt-nd-2xl">
                {busy ? (
                    <button type="button" onClick={cancelUpload} className="btn-secondary">
                        <X size={16} /> Cancel
                    </button>
                ) : (
                    <>
                        <button type="submit" className="btn-primary" disabled={!file || detecting}>
                            <UploadSimple size={16} weight="bold" /> Upload build
                        </button>
                        <a href={`/dashboard/apps/${appId}`} className="btn-ghost">
                            Cancel
                        </a>
                    </>
                )}
            </div>
        </form>
    );
}
