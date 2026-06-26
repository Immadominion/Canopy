/**
 * Send feedback — a dedicated screen so the form owns its space and its teal
 * SEND button never competes with the install action on the detail screen.
 *
 * Optional screenshot uploads straight to R2 via a presigned PUT (no body
 * limit, no CORS on native), then the feedback is submitted with the key.
 */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/ui/icon";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { getFeedbackUploadUrl, submitFeedback } from "@/lib/api";
import { PrimaryButton, ScreenshotField, SecondaryButton, SectionLabel } from "@/ui/components";
import { colors, mono, space } from "@/ui/theme";

interface Shot {
    uri: string;
    fileName: string | null;
    fileSize: number | null;
}

export default function FeedbackScreen(): React.JSX.Element {
    const { trackId, v } = useLocalSearchParams<{ trackId: string; v?: string }>();
    const insets = useSafeAreaInsets();
    const versionCode = v ? Number(v) : NaN;

    const [message, setMessage] = useState("");
    const [shot, setShot] = useState<Shot | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    async function pickImage(): Promise<void> {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.7,
        });
        const asset = result.canceled ? null : result.assets[0];
        if (asset) {
            setShot({ uri: asset.uri, fileName: asset.fileName ?? null, fileSize: asset.fileSize ?? null });
        }
    }

    async function handleSubmit(): Promise<void> {
        const trimmed = message.trim();
        if (!trimmed) {
            setError("ENTER_A_MESSAGE");
            return;
        }
        setBusy(true);
        setError("");
        try {
            let screenshotKey: string | undefined;
            if (shot) {
                const { uploadKey, url } = await getFeedbackUploadUrl(trackId);
                const up = await FileSystem.uploadAsync(url, shot.uri, {
                    httpMethod: "PUT",
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                });
                if (up.status !== 200) throw new Error("SCREENSHOT_UPLOAD_FAILED");
                screenshotKey = uploadKey;
            }
            await submitFeedback({
                trackId,
                message: trimmed,
                screenshotKey,
                appVersionCode: Number.isFinite(versionCode) ? versionCode : undefined,
            });
            setDone(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "FEEDBACK_FAILED");
        } finally {
            setBusy(false);
        }
    }

    if (done) {
        return (
            <View style={styles.successWrap}>
                <StatusBar style="light" />
                <Icon name="checkmark-circle" size={56} color={colors.brand} />
                <Text style={styles.successTitle}>Sent</Text>
                <Text style={styles.successBody}>The developer has your note.</Text>
                <View style={styles.successButtons}>
                    <SecondaryButton
                        label="SEND ANOTHER"
                        onPress={() => {
                            setMessage("");
                            setShot(null);
                            setDone(false);
                        }}
                        style={styles.flex}
                    />
                    <SecondaryButton
                        label="DONE"
                        onPress={() => {
                            router.back();
                        }}
                        style={styles.flex}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <StatusBar style="light" />
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.context}>Goes straight to the developer.</Text>

                <TextInput
                    style={styles.input}
                    placeholder="What's working, what's broken, ideas…"
                    placeholderTextColor={colors.textTertiary}
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    autoFocus
                    editable={!busy}
                    maxLength={2000}
                />
                <Text style={styles.counter}>{message.length} / 2000</Text>

                <View style={styles.shotSection}>
                    <SectionLabel>SCREENSHOT (OPTIONAL)</SectionLabel>
                    <ScreenshotField
                        uri={shot?.uri ?? null}
                        fileName={shot?.fileName}
                        fileSize={shot?.fileSize}
                        onPick={() => void pickImage()}
                        onRemove={() => {
                            setShot(null);
                        }}
                        disabled={busy}
                    />
                </View>

                {error ? <Text style={styles.error}>[ {error} ]</Text> : null}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>
                <PrimaryButton
                    label={busy ? "SENDING…" : "SEND FEEDBACK"}
                    onPress={() => void handleSubmit()}
                    busy={busy}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: space(5), paddingTop: space(5), paddingBottom: space(8) },
    context: {
        fontFamily: mono,
        fontSize: 12,
        color: colors.textTertiary,
        letterSpacing: 0.3,
        marginBottom: space(4),
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        minHeight: 140,
        padding: space(3.5),
        color: colors.textPrimary,
        fontSize: 16,
        lineHeight: 23,
        backgroundColor: colors.surface,
        textAlignVertical: "top",
    },
    counter: {
        fontFamily: mono,
        fontSize: 11,
        color: colors.textTertiary,
        textAlign: "right",
        marginTop: space(2),
    },
    shotSection: { marginTop: space(7) },
    error: {
        fontFamily: mono,
        fontSize: 12,
        color: colors.accent,
        marginTop: space(5),
        letterSpacing: 0.5,
    },
    footer: {
        paddingHorizontal: space(5),
        paddingTop: space(3),
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.bg,
    },
    successWrap: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space(8),
    },
    successTitle: {
        fontSize: 22,
        fontWeight: "700",
        color: colors.textDisplay,
        marginTop: space(4),
    },
    successBody: {
        fontSize: 15,
        color: colors.textSecondary,
        marginTop: space(2),
        textAlign: "center",
    },
    successButtons: { flexDirection: "row", gap: space(3), marginTop: space(8), alignSelf: "stretch" },
    flex: { flex: 1 },
});
