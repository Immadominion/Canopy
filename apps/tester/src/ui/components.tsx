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
import { formatBytes } from "./format";
import { Icon, type IconName } from "./icon";
import { avatarShade, chipColors, colors, mono, monogram, radius, space, type ChipTone } from "./theme";

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

/**
 * Compact, fixed-width install action for the screen header — never resizes
 * between states. Shows an icon + short label at rest, or a spinner + live
 * progress label mid-install.
 */
export function InstallPill({
    icon,
    label,
    tone,
    busy = false,
    progressLabel,
    disabled = false,
    onPress,
}: {
    icon: IconName;
    label: string;
    tone: "brand" | "success" | "retry";
    busy?: boolean;
    progressLabel?: string;
    disabled?: boolean;
    onPress?: () => void;
}): React.JSX.Element {
    const palette =
        tone === "brand"
            ? { bg: colors.brand, fg: colors.onBrand, border: colors.brand }
            : tone === "retry"
              ? { bg: "transparent", fg: colors.accent, border: colors.accent }
              : { bg: "transparent", fg: colors.textSecondary, border: colors.borderVisible };
    const inactive = busy || disabled;
    return (
        <Pressable
            onPress={onPress}
            disabled={inactive}
            style={({ pressed }) => [
                styles.pill,
                { backgroundColor: palette.bg, borderColor: palette.border },
                pressed && !inactive && styles.primaryPressed,
            ]}
        >
            {busy ? (
                <>
                    <ActivityIndicator size="small" color={palette.fg} />
                    {progressLabel ? (
                        <Text style={[styles.pillLabel, { color: palette.fg }]}>{progressLabel}</Text>
                    ) : null}
                </>
            ) : (
                <>
                    <Icon name={icon} size={15} color={palette.fg} />
                    <Text style={[styles.pillLabel, { color: palette.fg }]} numberOfLines={1}>
                        {label}
                    </Text>
                </>
            )}
        </Pressable>
    );
}

/** A quiet, subordinate navigation row — icon · label · chevron. */
export function GhostRow({
    icon,
    label,
    onPress,
}: {
    icon: IconName;
    label: string;
    onPress: () => void;
}): React.JSX.Element {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.ghostRow, pressed && { backgroundColor: colors.surfacePressed }]}
        >
            <Icon name={icon} size={18} color={colors.textSecondary} />
            <Text style={styles.ghostLabel} numberOfLines={1}>
                {label}
            </Text>
            <Icon name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable>
    );
}

/**
 * Optional-screenshot attach control: a dashed "Add" tile when empty, or an
 * 88×88 thumbnail with an overlapping remove badge once a shot is picked.
 */
export function ScreenshotField({
    uri,
    fileName,
    fileSize,
    onPick,
    onRemove,
    disabled = false,
}: {
    uri: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    onPick: () => void;
    onRemove: () => void;
    disabled?: boolean;
}): React.JSX.Element {
    if (!uri) {
        return (
            <Pressable onPress={onPick} disabled={disabled}>
                {({ pressed }) => (
                    <View style={styles.shotRow}>
                        <View style={[styles.shotTile, pressed && styles.shotTilePressed]}>
                            <Icon name="add" size={24} color={colors.brand} />
                            <Text style={styles.shotTileText}>Add</Text>
                        </View>
                        <Text style={styles.shotCaption}>
                            Add a screenshot — helps the developer reproduce what you saw.
                        </Text>
                    </View>
                )}
            </Pressable>
        );
    }
    const meta = `${fileName ?? "Screenshot"}${fileSize != null ? ` · ${formatBytes(fileSize)}` : ""}`;
    return (
        <View style={styles.shotRow}>
            <Pressable onPress={onPick} disabled={disabled} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <Pressable onPress={onRemove} hitSlop={8} style={styles.removeBadge}>
                    <Icon name="close" size={15} color={colors.accent} />
                </Pressable>
            </Pressable>
            <Text style={styles.shotCaption}>
                {meta}
                {"\n"}Tap image to replace.
            </Text>
        </View>
    );
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
    pill: {
        width: 120,
        height: 44,
        borderRadius: radius.pill,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space(1.5),
        paddingHorizontal: space(2),
    },
    pillLabel: {
        fontFamily: mono,
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0.5,
        textTransform: "uppercase",
    },
    ghostRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: space(3),
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        paddingHorizontal: space(4),
        height: 52,
    },
    ghostLabel: { flex: 1, fontSize: 15, color: colors.textPrimary, fontWeight: "500" },
    shotRow: { flexDirection: "row", alignItems: "center", gap: space(4) },
    shotTile: {
        width: 88,
        height: 88,
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.borderVisible,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        gap: space(1),
    },
    shotTilePressed: { backgroundColor: colors.brandSubtle, borderColor: colors.brand },
    shotTileText: { fontFamily: mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 0.5 },
    shotCaption: { flex: 1, fontSize: 13, color: colors.textTertiary, lineHeight: 19 },
    thumbWrap: { width: 88, height: 88 },
    thumb: {
        width: 88,
        height: 88,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    removeBadge: {
        position: "absolute",
        top: -8,
        right: -8,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.borderVisible,
        alignItems: "center",
        justifyContent: "center",
    },
});
