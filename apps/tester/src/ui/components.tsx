/**
 * Shared UI primitives for the tester app — matches the Canopy web dashboard
 * (teal brand, dark-refreshed surfaces, rounded cards, semantic status chips).
 */
import React, { useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";

import { avatarShade, chipColors, colors, mono, monogram, space, type ChipTone } from "./theme";

/**
 * App-icon avatar — the real launcher icon when available, with a guaranteed
 * monogram fallback so an app never renders without a visual (used when there's
 * no icon URL or the image fails to load).
 */
export function AppAvatar({
    name,
    iconUri,
    size = 52,
}: {
    name: string;
    iconUri?: string | null;
    size?: number;
}): React.JSX.Element {
    const [failed, setFailed] = useState(false);
    const box = { width: size, height: size, borderRadius: size * 0.26 };

    if (iconUri && !failed) {
        return (
            <Image
                source={{ uri: iconUri }}
                style={[styles.avatar, box]}
                onError={() => {
                    setFailed(true);
                }}
            />
        );
    }

    return (
        <View style={[styles.avatar, box, { backgroundColor: avatarShade(name) }]}>
            <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{monogram(name)}</Text>
        </View>
    );
}

/** Small uppercase status pill with a semantic tone. */
export function Chip({ label, tone = "neutral" }: { label: string; tone?: ChipTone }): React.JSX.Element {
    const { bg, fg } = chipColors(tone);
    return (
        <View style={[styles.chip, { backgroundColor: bg }]}>
            <Text style={[styles.chipLabel, { color: fg }]}>{label}</Text>
        </View>
    );
}

/** The one obvious primary action — teal button with optional spinner. */
export function PrimaryButton({
    label,
    onPress,
    busy = false,
    disabled = false,
    style,
}: {
    label: string;
    onPress: () => void;
    busy?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
    const isDisabled = busy || disabled;
    return (
        <Pressable
            onPress={onPress}
            disabled={isDisabled}
            style={({ pressed }) => [
                styles.primary,
                (pressed || isDisabled) && styles.primaryPressed,
                style,
            ]}
        >
            {busy && <ActivityIndicator size="small" color={colors.onBrand} style={styles.spinner} />}
            <Text style={styles.primaryLabel}>{label}</Text>
        </Pressable>
    );
}

/** Outlined secondary action — for non-primary / recovery actions (e.g. Remove). */
export function SecondaryButton({
    label,
    onPress,
    busy = false,
    disabled = false,
    tone = "neutral",
    style,
}: {
    label: string;
    onPress: () => void;
    busy?: boolean;
    disabled?: boolean;
    tone?: "neutral" | "danger";
    style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
    const isDisabled = busy || disabled;
    const fg = tone === "danger" ? colors.accent : colors.textPrimary;
    return (
        <Pressable
            onPress={onPress}
            disabled={isDisabled}
            style={({ pressed }) => [
                styles.secondary,
                tone === "danger" && styles.secondaryDanger,
                (pressed || isDisabled) && styles.secondaryPressed,
                style,
            ]}
        >
            {busy && <ActivityIndicator size="small" color={fg} style={styles.spinner} />}
            <Text style={[styles.secondaryLabel, { color: fg }]}>{label}</Text>
        </Pressable>
    );
}

/** Determinate progress bar (teal). Uses flex ratios to avoid percentage strings. */
export function ProgressBar({ pct }: { pct: number }): React.JSX.Element {
    const clamped = Math.max(0, Math.min(100, pct));
    return (
        <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { flex: clamped }]} />
            <View style={{ flex: 100 - clamped }} />
        </View>
    );
}

/** Section heading — small caption used above content groups. */
export function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
    return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
    avatar: {
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
    },
    avatarText: { color: colors.textPrimary, fontFamily: mono, letterSpacing: 1, fontWeight: "600" },
    chip: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: space(2.5),
        paddingVertical: space(1),
    },
    chipLabel: {
        fontSize: 11,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        fontWeight: "700",
    },
    primary: {
        backgroundColor: colors.brand,
        borderRadius: 999,
        paddingVertical: space(4),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    primaryPressed: { opacity: 0.7 },
    primaryLabel: {
        fontSize: 15,
        fontWeight: "700",
        letterSpacing: 0.3,
        color: colors.onBrand,
    },
    secondary: {
        backgroundColor: "transparent",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.borderVisible,
        paddingVertical: space(3.5),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryDanger: { borderColor: colors.accent },
    secondaryPressed: { opacity: 0.6 },
    secondaryLabel: {
        fontSize: 14,
        fontWeight: "700",
        letterSpacing: 0.3,
    },
    spinner: { marginRight: space(2) },
    progressTrack: {
        height: 8,
        borderRadius: 999,
        backgroundColor: colors.border,
        overflow: "hidden",
        flexDirection: "row",
    },
    progressBar: {
        height: "100%",
        backgroundColor: colors.brand,
    },
    sectionLabel: {
        fontSize: 11,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: colors.textTertiary,
        marginBottom: space(3),
        fontWeight: "600",
    },
});
