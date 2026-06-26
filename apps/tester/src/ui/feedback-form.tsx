/**
 * Send-feedback form for a beta — written note + optional screenshot.
 *
 * The screenshot uploads straight to R2 via a presigned PUT (no body limit, no
 * CORS on native), then the feedback is submitted referencing the uploaded key.
 */
import React, { useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { getFeedbackUploadUrl, submitFeedback } from "@/lib/api";
import { PrimaryButton, SecondaryButton, SectionLabel } from "@/ui/components";
import { colors, mono, space } from "@/ui/theme";

export function FeedbackForm({
    trackId,
    versionCode,
}: {
    trackId: string;
    versionCode: number;
}): React.JSX.Element {
    const [message, setMessage] = useState("");
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    async function pickImage(): Promise<void> {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
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
            if (imageUri) {
                const { uploadKey, url } = await getFeedbackUploadUrl(trackId);
                const up = await FileSystem.uploadAsync(url, imageUri, {
                    httpMethod: "PUT",
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                });
                if (up.status !== 200) throw new Error("SCREENSHOT_UPLOAD_FAILED");
                screenshotKey = uploadKey;
            }
            await submitFeedback({ trackId, message: trimmed, screenshotKey, appVersionCode: versionCode });
            setMessage("");
            setImageUri(null);
            setDone(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "FEEDBACK_FAILED");
        } finally {
            setBusy(false);
        }
    }

    if (done) {
        return (
            <View style={styles.section}>
                <SectionLabel>FEEDBACK</SectionLabel>
                <Text style={styles.thanks}>
                    Thanks — your feedback was sent to the developer.
                </Text>
                <SecondaryButton
                    label="SEND ANOTHER"
                    onPress={() => {
                        setDone(false);
                    }}
                    style={styles.spaced}
                />
            </View>
        );
    }

    return (
        <View style={styles.section}>
            <SectionLabel>SEND FEEDBACK</SectionLabel>
            <TextInput
                style={styles.input}
                placeholder="What's working, what's broken, ideas…"
                placeholderTextColor={colors.textTertiary}
                value={message}
                onChangeText={setMessage}
                multiline
                editable={!busy}
                maxLength={2000}
            />

            {imageUri ? (
                <View style={styles.previewRow}>
                    <Image source={{ uri: imageUri }} style={styles.preview} />
                    <SecondaryButton
                        label="REMOVE"
                        tone="danger"
                        onPress={() => {
                            setImageUri(null);
                        }}
                        disabled={busy}
                        style={styles.previewBtn}
                    />
                </View>
            ) : (
                <SecondaryButton
                    label="ATTACH SCREENSHOT"
                    onPress={() => void pickImage()}
                    disabled={busy}
                    style={styles.spaced}
                />
            )}

            {error ? <Text style={styles.error}>[ {error} ]</Text> : null}

            <PrimaryButton
                label={busy ? "SENDING…" : "SEND FEEDBACK"}
                onPress={() => void handleSubmit()}
                busy={busy}
                style={styles.spaced}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    section: { marginTop: space(8) },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        minHeight: 96,
        padding: space(3.5),
        color: colors.textPrimary,
        fontSize: 15,
        textAlignVertical: "top",
        marginTop: space(2),
    },
    spaced: { marginTop: space(4) },
    previewRow: { flexDirection: "row", alignItems: "center", gap: space(4), marginTop: space(4) },
    preview: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    previewBtn: { flex: 1 },
    error: {
        fontFamily: mono,
        fontSize: 12,
        color: colors.accent,
        marginTop: space(3),
        letterSpacing: 0.5,
    },
    thanks: { fontSize: 15, color: colors.textSecondary, lineHeight: 23, marginTop: space(2) },
});
