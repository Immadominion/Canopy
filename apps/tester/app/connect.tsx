/**
 * Connect screen — Sign-In-With-Solana via Mobile Wallet Adapter.
 * On success a session is stored in the keystore and we route to "My Apps".
 */
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useSiwsLogin } from "@/lib/siws";
import { PrimaryButton } from "@/ui/components";
import { colors, mono, space } from "@/ui/theme";
import logo from "../assets/logo.png";

/** Only allow resuming to an in-app path (e.g. "/beta/123") — never an external URL. */
function safeNext(next: string | undefined): string {
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/";
}

export default function ConnectScreen(): React.JSX.Element {
    const { next } = useLocalSearchParams<{ next?: string }>();
    const { status, errorCode, login } = useSiwsLogin();
    const busy = status === "connecting" || status === "signing" || status === "verifying";

    async function handleConnect(): Promise<void> {
        const ok = await login();
        if (ok) router.replace(safeNext(next));
    }

    const label =
        status === "connecting"
            ? "CONNECTING…"
            : status === "signing"
              ? "WAITING FOR SIGNATURE…"
              : status === "verifying"
                ? "VERIFYING…"
                : "CONNECT WALLET";

    return (
        <View style={styles.root}>
            <StatusBar style="light" />

            <Image source={logo} style={styles.brandMark} resizeMode="contain" />
            <Text style={styles.wordmark}>Canopy</Text>
            <Text style={styles.tagline}>BETA TESTING FOR SOLANA MOBILE</Text>

            <Text style={styles.body}>
                Connect your Solana wallet to see the betas you&apos;ve been invited to test.
                Every build is verified against its signed fingerprint before it installs.
            </Text>

            <PrimaryButton label={label} onPress={() => void handleConnect()} busy={busy} />

            {status === "error" && <Text style={styles.error}>[ ERROR: {errorCode} ]</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space(6), justifyContent: "center" },
    brandMark: {
        width: 64,
        height: 64,
        marginBottom: space(5),
    },
    wordmark: { fontSize: 34, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.5 },
    tagline: {
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: 1.5,
        color: colors.textTertiary,
        marginTop: space(2),
        textTransform: "uppercase",
    },
    body: { fontSize: 15, color: colors.textSecondary, lineHeight: 23, marginTop: space(6), marginBottom: space(8) },
    error: { fontFamily: mono, fontSize: 12, color: colors.accent, marginTop: space(4), letterSpacing: 0.5 },
});
