/**
 * Home screen — demonstrates all four @canopy/react-native SDK features:
 *
 * 1. useCanopyTransact  — wraps MWA transact() with automatic analytics events.
 *                         Emits mwa_session_start, mwa_wallet_connected, etc.
 * 2. useCanopy.identify — SHA-256 hashes the wallet address on-device, stores
 *                         walletHash for all subsequent events.
 * 3. useCanopy.track    — queues a custom named event with optional properties.
 * 4. useRemoteConfig    — fetches a feature-flag value (stale-while-revalidate).
 *
 * This screen is intentionally self-contained so that all SDK usage patterns
 * are visible in one file.
 */
import React, { useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useCanopy, useRemoteConfig } from "@canopy/react-native";
import { useMobileWallet } from "@/hooks/useMobileWallet";

// ---------------------------------------------------------------------------
// Remote-config feature flag
// Defaults to false until the SDK fetches the server-side value.
// ---------------------------------------------------------------------------
function FeatureFlagSection(): React.JSX.Element {
    const showNewSwapUI = useRemoteConfig<boolean>("feature_new_swap_ui", false);
    const onboardingVariant = useRemoteConfig<string>(
        "onboarding_variant",
        "control",
    );

    return (
        <Section title="Remote Config">
            <Row label="feature_new_swap_ui" value={String(showNewSwapUI)} />
            <Row label="onboarding_variant" value={onboardingVariant} />
        </Section>
    );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function HomeScreen(): React.JSX.Element {
    const { track } = useCanopy();
    const { publicKey, connect, disconnect, connecting } = useMobileWallet();
    const [eventLog, setEventLog] = useState<string[]>([]);

    const log = (msg: string): void => {
        setEventLog((prev) => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev.slice(0, 9)]);
    };

    // Track a custom button_pressed event
    const handleTrackEvent = (): void => {
        track("button_pressed", { label: "demo_track", screen: "home" });
        log("Tracked: button_pressed { label: demo_track }");
    };

    // Track a page_view event (demonstrates structured event properties)
    const handleTrackPageView = (): void => {
        track("page_view", { page: "home", referrer: null });
        log("Tracked: page_view { page: home }");
    };

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <StatusBar style="light" />

            {/* ── HEADER ── */}
            <Text style={styles.headline}>
                {publicKey ? "WALLET CONNECTED" : "CONNECT WALLET"}
            </Text>
            <Text style={styles.subtitle}>
                {publicKey
                    ? `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`
                    : "Tap below to connect via Mobile Wallet Adapter"}
            </Text>

            {/* ── WALLET SECTION ── */}
            <Section title="1 · Mobile Wallet Adapter">
                <Text style={styles.body}>
                    useCanopyTransact() wraps MWA's transact(). It automatically emits
                    mwa_session_start, mwa_wallet_connected, and mwa_session_end events —
                    no extra tracking code needed.
                </Text>
                {publicKey ? (
                    <Button label="DISCONNECT" onPress={disconnect} variant="secondary" />
                ) : (
                    <Button
                        label={connecting ? "CONNECTING…" : "CONNECT WALLET"}
                        onPress={() => { void connect(); }}
                        disabled={connecting}
                    />
                )}
            </Section>

            {/* ── CUSTOM EVENTS SECTION ── */}
            <Section title="2 · Custom Event Tracking">
                <Text style={styles.body}>
                    useCanopy().track() queues named events with optional properties.
                    Events are batched and flushed to the ingest service in the
                    background.
                </Text>
                <Button label="TRACK BUTTON_PRESSED" onPress={handleTrackEvent} />
                <Button
                    label="TRACK PAGE_VIEW"
                    onPress={handleTrackPageView}
                    variant="secondary"
                />
                {eventLog.length > 0 && (
                    <View style={styles.log}>
                        {eventLog.map((entry, i) => (
                            <Text key={i} style={styles.logLine}>
                                {entry}
                            </Text>
                        ))}
                    </View>
                )}
            </Section>

            {/* ── REMOTE CONFIG SECTION ── */}
            <Section title="3 · Remote Config">
                <Text style={styles.body}>
                    useRemoteConfig() resolves a feature-flag value from the Canopy
                    dashboard. Uses stale-while-revalidate — stale cache is returned
                    immediately while a background fetch updates the value.
                </Text>
                <FeatureFlagSection />
            </Section>
        </ScrollView>
    );
}

// ---------------------------------------------------------------------------
// Reusable UI primitives (purposely minimal — this is an SDK demo, not a
// production UI)
// ---------------------------------------------------------------------------

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}): React.JSX.Element {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {children}
        </View>
    );
}

function Row({
    label,
    value,
}: {
    label: string;
    value: string;
}): React.JSX.Element {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
    );
}

function Button({
    label,
    onPress,
    disabled = false,
    variant = "primary",
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: "primary" | "secondary";
}): React.JSX.Element {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.button,
                variant === "secondary" && styles.buttonSecondary,
                (pressed || disabled) && styles.buttonPressed,
            ]}
        >
            {disabled && <ActivityIndicator size="small" color="#ffffff" style={styles.spinner} />}
            <Text style={[styles.buttonLabel, variant === "secondary" && styles.buttonLabelSecondary]}>
                {label}
            </Text>
        </Pressable>
    );
}

// ---------------------------------------------------------------------------
// Styles (Nothing Design: OLED black, Space Mono labels, no shadows)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "#000000",
    },
    content: {
        padding: 24,
        paddingBottom: 48,
    },
    headline: {
        fontFamily: "SpaceMono-Regular",
        fontSize: 22,
        letterSpacing: 2,
        color: "#FFFFFF",
        marginBottom: 6,
        textTransform: "uppercase",
    },
    subtitle: {
        fontFamily: "SpaceMono-Regular",
        fontSize: 12,
        color: "#666666",
        marginBottom: 32,
        letterSpacing: 0.5,
    },
    section: {
        marginBottom: 36,
    },
    sectionTitle: {
        fontFamily: "SpaceMono-Regular",
        fontSize: 11,
        color: "#666666",
        letterSpacing: 1.5,
        textTransform: "uppercase",
        marginBottom: 12,
    },
    body: {
        fontFamily: "SpaceGrotesk-Regular",
        fontSize: 14,
        color: "#999999",
        lineHeight: 22,
        marginBottom: 16,
    },
    button: {
        backgroundColor: "#FFFFFF",
        paddingVertical: 14,
        paddingHorizontal: 20,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    buttonSecondary: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "#333333",
    },
    buttonPressed: {
        opacity: 0.6,
    },
    buttonLabel: {
        fontFamily: "SpaceMono-Regular",
        fontSize: 12,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: "#000000",
    },
    buttonLabelSecondary: {
        color: "#FFFFFF",
    },
    spinner: {
        marginRight: 8,
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#1A1A1A",
    },
    rowLabel: {
        fontFamily: "SpaceMono-Regular",
        fontSize: 11,
        color: "#666666",
        letterSpacing: 0.5,
    },
    rowValue: {
        fontFamily: "SpaceMono-Regular",
        fontSize: 11,
        color: "#FFFFFF",
        letterSpacing: 0.5,
    },
    log: {
        marginTop: 12,
        padding: 12,
        backgroundColor: "#0A0A0A",
        borderWidth: 1,
        borderColor: "#1A1A1A",
    },
    logLine: {
        fontFamily: "SpaceMono-Regular",
        fontSize: 10,
        color: "#555555",
        letterSpacing: 0.3,
        marginBottom: 2,
    },
});
