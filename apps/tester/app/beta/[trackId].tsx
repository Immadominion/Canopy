/**
 * Beta detail + install. Resolves the track from the wallet's beta list, shows
 * "What's New" + details, and runs the trusted-install pipeline (download →
 * verify SHA-256 → PackageInstaller) on tap, with live step progress.
 *
 * Revoked/expired betas show a "no longer supported" notice and, if the build
 * is still on the device, a one-tap Remove (system uninstall confirmation).
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { listMyBetas, type BetaSummary } from "@/lib/api";
import { loadSession, UnauthenticatedError } from "@/lib/session";
import { downloadVerifyInstall, type InstallStep } from "@/lib/verify";
import { installer } from "@/native/installer";
import {
    AppAvatar,
    Chip,
    GhostRow,
    InstallPill,
    ProgressBar,
    SecondaryButton,
    SectionLabel,
} from "@/ui/components";
import { InstallStatusStrip } from "@/ui/install-status-strip";
import { formatBytes } from "@/ui/format";
import { colors, mono, space, type ChipTone } from "@/ui/theme";

/** What the install button does given the device's current install state. */
type InstallMode = "install" | "update" | "current";

/**
 * Derive the mode from the installed versionCode (null = not installed) and the
 * beta's target versionCode. `undefined` means we haven't checked yet.
 */
function deriveMode(installed: number | null | undefined, target: number): InstallMode {
    if (installed == null) return "install";
    return installed < target ? "update" : "current";
}

/** The header status line while an install is in progress. */
function busyStatusText(
    step: InstallStep | null,
    downloadPct: number,
    sizeBytes: number | null,
    mode: InstallMode,
): string {
    switch (step) {
        case "preparing":
            return "PREPARING…";
        case "downloading":
            return `${String(Math.round(downloadPct * 100))}% · ${formatBytes(sizeBytes)}`;
        case "verifying":
            return "VERIFYING…";
        case "installing":
            return mode === "update" ? "UPDATING…" : "INSTALLING…";
        default:
            return "";
    }
}

/** Map the discrete install step to an approximate progress percentage. */
function stepPct(step: InstallStep | null): number {
    switch (step) {
        case "preparing":
            return 12;
        case "downloading":
            return 45;
        case "verifying":
            return 72;
        case "installing":
            return 92;
        case "done":
            return 100;
        default:
            return 0;
    }
}

function statusChip(
    beta: BetaSummary,
    mode: InstallMode,
    isInstalled: boolean,
): { label: string; tone: ChipTone } {
    if (beta.status === "revoked") return { label: "REVOKED", tone: "error" };
    if (beta.status === "expired") return { label: "EXPIRED", tone: "warning" };
    if (isInstalled) return { label: "INSTALLED", tone: "success" };
    if (mode === "update") return { label: "UPDATE AVAILABLE", tone: "brand" };
    return { label: "READY TO INSTALL", tone: "brand" };
}

function Detail({ label, value }: { label: string; value: string }): React.JSX.Element {
    return (
        <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue}>{value}</Text>
        </View>
    );
}

export default function BetaDetailScreen(): React.JSX.Element | null {
    const { trackId } = useLocalSearchParams<{ trackId: string }>();
    const [beta, setBeta] = useState<BetaSummary | null>(null);
    // Prior builds of the same app this wallet can see (the "what to test" history).
    const [history, setHistory] = useState<BetaSummary[]>([]);
    const [loadError, setLoadError] = useState("");
    const [step, setStep] = useState<InstallStep | null>(null);
    const [installError, setInstallError] = useState("");
    const [installHint, setInstallHint] = useState("");
    const [installDetail, setInstallDetail] = useState("");
    const [downloadPct, setDownloadPct] = useState(0);
    const [removing, setRemoving] = useState(false);
    const [removeError, setRemoveError] = useState("");
    // undefined = not yet checked; null = not installed; number = installed versionCode.
    const [installedVersion, setInstalledVersion] = useState<number | null | undefined>(undefined);

    /** Read the installed versionCode for this beta's package from the device. */
    const refreshInstalledVersion = useCallback((b: BetaSummary): void => {
        if (!b.packageName || !installer.isAvailable()) {
            setInstalledVersion(null);
            return;
        }
        setInstalledVersion(installer.getInstalledVersion(b.packageName));
    }, []);

    useEffect(() => {
        async function load(): Promise<void> {
            const session = await loadSession();
            if (!session) {
                // Deep-linked here while signed out — connect, then resume here.
                router.replace(`/connect?next=/beta/${trackId}`);
                return;
            }
            try {
                const betas = await listMyBetas();
                const match = betas.find((b) => b.trackId === trackId) ?? null;
                if (!match) setLoadError("NOT_FOUND");
                setBeta(match);
                if (match) {
                    refreshInstalledVersion(match);
                    // Earlier builds of the same app, newest first, with notes.
                    setHistory(
                        betas
                            .filter(
                                (b) =>
                                    b.trackId !== match.trackId &&
                                    b.packageName != null &&
                                    b.packageName === match.packageName &&
                                    b.releaseNotes != null &&
                                    b.versionCode < match.versionCode,
                            )
                            .sort((a, b) => b.versionCode - a.versionCode),
                    );
                }
            } catch (err) {
                if (err instanceof UnauthenticatedError) {
                    router.replace(`/connect?next=/beta/${trackId}`);
                    return;
                }
                setLoadError(err instanceof Error ? err.message : "LOAD_FAILED");
            }
        }
        void load();
    }, [trackId, refreshInstalledVersion]);

    const handleInstall = useCallback(async (): Promise<void> => {
        if (!beta) return;
        setInstallError("");
        setInstallHint("");
        setInstallDetail("");
        setDownloadPct(0);
        const result = await downloadVerifyInstall(beta, setStep, setDownloadPct);
        if (!result.ok) {
            setInstallError(result.errorCode ?? "INSTALL_FAILED");
            setInstallHint(result.hint ?? "");
            setInstallDetail(result.errorDetail ?? "");
            setStep(null);
            return;
        }
        // Reflect the now-installed build so the button settles to "INSTALLED ✓".
        refreshInstalledVersion(beta);
    }, [beta, refreshInstalledVersion]);

    const handleRemove = useCallback(async (): Promise<void> => {
        if (!beta?.packageName) return;
        setRemoveError("");
        setRemoving(true);
        try {
            const result = await installer.uninstall(beta.packageName);
            if (result.status === "removed") {
                refreshInstalledVersion(beta);
                // Clear any signature-mismatch error we were recovering from.
                setInstallError("");
                setInstallHint("");
                setInstallDetail("");
            } else if (result.status !== "user_cancelled") {
                setRemoveError(result.message ? `REMOVE_FAILED · ${result.message}` : "REMOVE_FAILED");
            }
        } finally {
            setRemoving(false);
        }
    }, [beta, refreshInstalledVersion]);

    if (beta === null && !loadError) {
        return (
            <View style={styles.center}>
                <StatusBar style="light" />
                <ActivityIndicator color={colors.textPrimary} />
            </View>
        );
    }

    if (loadError) {
        return (
            <View style={styles.center}>
                <StatusBar style="light" />
                <Text style={styles.error}>[ {loadError} ]</Text>
            </View>
        );
    }

    if (!beta) return null;

    const isActive = beta.status === "active";
    const busy = step !== null && step !== "done";
    const mode = step === "done" ? "current" : deriveMode(installedVersion, beta.versionCode);
    const isInstalled = mode === "current";
    const chip = statusChip(beta, mode, isInstalled);
    const expires = new Date(beta.expiresAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <StatusBar style="light" />

            {/* Header — app identity + the compact install pill on the right */}
            <View style={styles.head}>
                <AppAvatar name={beta.appName} iconUri={beta.iconUrl} size={64} />
                <View style={styles.headBody}>
                    <Text style={styles.appName} numberOfLines={2}>
                        {beta.appName}
                    </Text>
                    <Text style={styles.version}>
                        {beta.versionName} ({beta.versionCode})
                    </Text>
                    <View style={styles.chipRow}>
                        {busy ? (
                            <Text style={styles.busyStatus}>
                                {busyStatusText(step, downloadPct, beta.apkSizeBytes, mode)}
                            </Text>
                        ) : (
                            <Chip label={chip.label} tone={chip.tone} />
                        )}
                    </View>
                </View>
                {isActive ? (
                    busy ? (
                        <InstallPill
                            tone="brand"
                            busy
                            icon="arrow-down"
                            label=""
                            progressLabel={
                                step === "downloading" ? `${String(Math.round(downloadPct * 100))}%` : "…"
                            }
                        />
                    ) : installError ? (
                        <InstallPill
                            tone="retry"
                            icon="refresh"
                            label="RETRY"
                            onPress={() => void handleInstall()}
                        />
                    ) : mode === "current" ? (
                        <InstallPill tone="success" icon="checkmark" label="INSTALLED" disabled />
                    ) : mode === "update" ? (
                        <InstallPill
                            tone="brand"
                            icon="arrow-up"
                            label="UPDATE"
                            onPress={() => void handleInstall()}
                        />
                    ) : (
                        <InstallPill
                            tone="brand"
                            icon="arrow-down"
                            label="INSTALL"
                            onPress={() => void handleInstall()}
                        />
                    )
                ) : null}
            </View>

            {/* Progress underline — hairline under the header while installing */}
            {busy ? (
                <View style={styles.progressUnderline}>
                    <ProgressBar
                        pct={step === "downloading" ? Math.round(downloadPct * 100) : stepPct(step)}
                    />
                </View>
            ) : null}

            {isActive ? (
                <>
                    {/* One-time install-permission heads-up */}
                    {!busy && !isInstalled && installer.isAvailable() && !installer.canInstall() ? (
                        <Text style={styles.permNote}>
                            First install asks Android to allow Canopy to install apps — one tap after that.
                        </Text>
                    ) : null}

                    {/* Update note + install failure + signature-mismatch recovery */}
                    <InstallStatusStrip
                        busy={busy}
                        mode={mode}
                        installedVersion={installedVersion ?? null}
                        targetVersion={beta.versionCode}
                        installError={installError}
                        installHint={installHint}
                        installDetail={installDetail}
                        packageName={beta.packageName}
                        removing={removing}
                        removeError={removeError}
                        onRemove={() => void handleRemove()}
                    />
                </>
            ) : (
                /* Revoked / expired — no install; offer removal if still on device. */
                <View style={styles.noticeBlock}>
                    <Text style={styles.notice}>
                        {beta.status === "revoked"
                            ? "The developer revoked this beta. It's no longer supported."
                            : "This beta has expired and is no longer available."}
                    </Text>
                    {installedVersion != null ? (
                        <>
                            <Text style={styles.permNote}>
                                It&apos;s still installed on your device — you can remove it.
                            </Text>
                            <SecondaryButton
                                label="REMOVE APP"
                                tone="danger"
                                busy={removing}
                                onPress={() => void handleRemove()}
                                style={styles.removeButton}
                            />
                        </>
                    ) : (
                        <Text style={styles.permNote}>Not installed on this device.</Text>
                    )}
                    {removeError ? <Text style={styles.error}>[ {removeError} ]</Text> : null}
                </View>
            )}

            {/* What's new */}
            {beta.releaseNotes ? (
                <View style={styles.section}>
                    <SectionLabel>WHAT&apos;S NEW</SectionLabel>
                    <Text style={styles.notes}>{beta.releaseNotes}</Text>
                </View>
            ) : null}

            {/* Previous builds — what changed across earlier versions */}
            {history.length > 0 ? (
                <View style={styles.section}>
                    <SectionLabel>PREVIOUS BUILDS</SectionLabel>
                    {history.map((h) => (
                        <View key={h.trackId} style={styles.historyItem}>
                            <Text style={styles.historyVersion}>
                                {h.versionName} ({h.versionCode})
                            </Text>
                            <Text style={styles.notes}>{h.releaseNotes}</Text>
                        </View>
                    ))}
                </View>
            ) : null}

            {/* Send feedback — quiet subordinate row → dedicated screen */}
            {isActive ? (
                <View style={styles.feedbackRow}>
                    <GhostRow
                        icon="create-outline"
                        label="Send feedback to the developer"
                        onPress={() => {
                            router.push(`/beta/${beta.trackId}/feedback?v=${String(beta.versionCode)}`);
                        }}
                    />
                </View>
            ) : null}

            {/* Details */}
            <View style={styles.section}>
                <SectionLabel>DETAILS</SectionLabel>
                <Detail label="Version" value={`${beta.versionName} (${String(beta.versionCode)})`} />
                {beta.apkSizeBytes != null ? (
                    <Detail label="Size" value={formatBytes(beta.apkSizeBytes)} />
                ) : null}
                {beta.packageName ? <Detail label="Package" value={beta.packageName} /> : null}
                <Detail label="Expires" value={expires} />
            </View>

            {/* Fingerprint (active builds only) */}
            {beta.apkSha256 ? (
                <View style={styles.section}>
                    <SectionLabel>FINGERPRINT (SHA-256)</SectionLabel>
                    <Text style={styles.hash}>{beta.apkSha256}</Text>
                </View>
            ) : null}

            {isActive ? (
                <Text style={styles.footer}>
                    Canopy verifies this build against its signed fingerprint before installing — a
                    tampered build never reaches your device.
                </Text>
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
    content: { paddingHorizontal: space(5), paddingTop: space(6), paddingBottom: space(12) },
    head: { flexDirection: "row", gap: space(4), alignItems: "center" },
    headBody: { flex: 1, minWidth: 0 },
    appName: { fontSize: 22, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.3 },
    version: { fontFamily: mono, fontSize: 13, color: colors.textTertiary, marginTop: space(1) },
    chipRow: { flexDirection: "row", marginTop: space(2.5) },
    busyStatus: {
        fontFamily: mono,
        fontSize: 12,
        color: colors.textSecondary,
        letterSpacing: 0.3,
    },
    progressUnderline: { marginTop: space(4) },
    feedbackRow: { marginTop: space(7) },
    permNote: {
        fontSize: 13,
        color: colors.textTertiary,
        lineHeight: 20,
        marginTop: space(4),
    },
    removeButton: { marginTop: space(5) },
    noticeBlock: { marginTop: space(7) },
    notice: { fontSize: 16, color: colors.textPrimary, lineHeight: 24, fontWeight: "600" },
    section: { marginTop: space(8) },
    notes: { fontSize: 15, color: colors.textSecondary, lineHeight: 24 },
    historyItem: {
        marginTop: space(4),
        paddingTop: space(4),
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    historyVersion: {
        fontFamily: mono,
        fontSize: 12,
        color: colors.textTertiary,
        letterSpacing: 0.3,
        marginBottom: space(2),
    },
    detailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: space(3),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    detailLabel: { fontSize: 14, color: colors.textSecondary },
    detailValue: {
        fontFamily: mono,
        fontSize: 13,
        color: colors.textPrimary,
        maxWidth: "62%",
        textAlign: "right",
    },
    hash: { fontFamily: mono, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
    error: { fontFamily: mono, fontSize: 12, color: colors.accent, marginTop: space(3), letterSpacing: 0.5 },
    footer: { fontSize: 13, color: colors.textTertiary, lineHeight: 20, marginTop: space(8) },
});
