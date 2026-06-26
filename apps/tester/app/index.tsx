/**
 * My Apps — the betas this wallet can install (TestFlight-style list).
 * Redirects to /connect when there is no stored session.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { listMyBetas, type BetaSummary } from "@/lib/api";
import { clearSession, loadSession, UnauthenticatedError } from "@/lib/session";
import { installer } from "@/native/installer";
import { AppAvatar, Chip } from "@/ui/components";
import logo from "../assets/logo.png";
import { formatBytes } from "@/ui/format";
import { colors, mono, space, type ChipTone } from "@/ui/theme";

/** Installed versionCode for a beta's package, or null (not installed / no native). */
function readInstalled(b: BetaSummary): number | null {
    if (!b.packageName || !installer.isAvailable()) return null;
    return installer.getInstalledVersion(b.packageName);
}

/** The row's status chip: lifecycle state first, then install/update/installed. */
function rowChip(
    item: BetaSummary,
    installed: number | null | undefined,
): { label: string; tone: ChipTone } {
    if (item.status === "revoked") return { label: "REVOKED", tone: "error" };
    if (item.status === "expired") return { label: "EXPIRED", tone: "warning" };
    if (installed == null) return { label: "INSTALL", tone: "brand" };
    if (installed < item.versionCode) return { label: "UPDATE", tone: "brand" };
    return { label: "INSTALLED", tone: "success" };
}

export default function MyAppsScreen(): React.JSX.Element {
    const [betas, setBetas] = useState<BetaSummary[] | null>(null);
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    // trackId -> installed versionCode (null = not installed / native unavailable).
    const [installedVersions, setInstalledVersions] = useState<Map<string, number | null>>(
        () => new Map(),
    );

    const buildVersionMap = useCallback((list: BetaSummary[]): Map<string, number | null> => {
        const m = new Map<string, number | null>();
        for (const b of list) m.set(b.trackId, readInstalled(b));
        return m;
    }, []);

    const load = useCallback(async (): Promise<void> => {
        const session = await loadSession();
        if (!session) {
            router.replace("/connect");
            return;
        }
        try {
            const list = await listMyBetas();
            setBetas(list);
            setInstalledVersions(buildVersionMap(list));
            setError("");
        } catch (err) {
            if (err instanceof UnauthenticatedError) {
                router.replace("/connect");
                return;
            }
            setError(err instanceof Error ? err.message : "LOAD_FAILED");
        }
    }, [buildVersionMap]);

    useEffect(() => {
        void load();
    }, [load]);

    // Re-read device install state whenever the screen regains focus — so the
    // chips update after returning from a successful install/uninstall.
    useFocusEffect(
        useCallback(() => {
            if (betas) setInstalledVersions(buildVersionMap(betas));
        }, [betas, buildVersionMap]),
    );

    const onRefresh = useCallback(async (): Promise<void> => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    async function handleSignOut(): Promise<void> {
        await clearSession();
        router.replace("/connect");
    }

    if (betas === null && !error) {
        return (
            <View style={styles.center}>
                <StatusBar style="light" />
                <ActivityIndicator color={colors.textPrimary} />
            </View>
        );
    }

    const count = betas?.length ?? 0;

    return (
        <View style={styles.root}>
            <StatusBar style="light" />
            <FlatList
                data={betas ?? []}
                keyExtractor={(b) => b.trackId}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => void onRefresh()}
                        tintColor={colors.textPrimary}
                    />
                }
                ListHeaderComponent={
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.titleRow}>
                                <Image source={logo} style={styles.headerLogo} resizeMode="contain" />
                                <Text style={styles.title}>Apps</Text>
                            </View>
                            <Text style={styles.subtitle}>
                                {count === 0 ? "No betas yet" : `${String(count)} available to test`}
                            </Text>
                        </View>
                        <Pressable hitSlop={8} onPress={() => void handleSignOut()}>
                            <Text style={styles.signOut}>SIGN OUT</Text>
                        </Pressable>
                    </View>
                }
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>
                            {error ? `[ ${error} ]` : "Nothing to test yet"}
                        </Text>
                        <Text style={styles.emptyBody}>
                            {error
                                ? "Pull down to retry."
                                : "When a developer adds your wallet to a beta, it shows up here. Pull to refresh."}
                        </Text>
                    </View>
                }
                renderItem={({ item }) => {
                    const chip = rowChip(item, installedVersions.get(item.trackId));
                    const metaText =
                        `${item.versionName} (${String(item.versionCode)})` +
                        (item.apkSizeBytes != null ? ` · ${formatBytes(item.apkSizeBytes)}` : "");
                    return (
                        <Pressable
                            onPress={() => {
                                router.push(`/beta/${item.trackId}`);
                            }}
                            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                        >
                            <AppAvatar name={item.appName} iconUri={item.iconUrl} />
                            <View style={styles.cardBody}>
                                <Text style={styles.appName} numberOfLines={1}>
                                    {item.appName}
                                </Text>
                                <Text style={styles.meta} numberOfLines={1}>
                                    {metaText}
                                </Text>
                            </View>
                            <Chip label={chip.label} tone={chip.tone} />
                        </Pressable>
                    );
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
    listContent: { paddingHorizontal: space(5), paddingTop: space(14), paddingBottom: space(10) },
    header: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: space(6),
    },
    headerLeft: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: space(2.5) },
    headerLogo: { width: 30, height: 30 },
    title: { fontSize: 32, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: space(1) },
    signOut: {
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: 1,
        color: colors.textTertiary,
        textTransform: "uppercase",
        marginTop: space(2),
    },
    card: {
        flexDirection: "row",
        alignItems: "center",
        gap: space(3.5),
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: space(3.5),
        marginBottom: space(3),
    },
    cardPressed: { backgroundColor: colors.surfacePressed },
    cardBody: { flex: 1, minWidth: 0 },
    appName: { fontSize: 17, fontWeight: "600", color: colors.textPrimary },
    meta: { fontFamily: mono, fontSize: 12, color: colors.textTertiary, marginTop: space(1), letterSpacing: 0.3 },
    empty: { paddingTop: space(20), alignItems: "flex-start" },
    emptyTitle: { fontSize: 20, fontWeight: "600", color: colors.textPrimary, marginBottom: space(2) },
    emptyBody: { fontSize: 15, color: colors.textSecondary, lineHeight: 23 },
});
