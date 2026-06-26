/**
 * The slim strip directly under the beta header. Carries the install context
 * the compact header pill can't: the update note, and the failure block (with
 * the SIGNATURE_MISMATCH "remove old copy" recovery). Progress itself lives in
 * the header (pill + the hairline ProgressBar underline). Returns null when
 * there's nothing to say.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { SecondaryButton } from "./components";
import { colors, mono, radius, space } from "./theme";

export function InstallStatusStrip({
    busy,
    mode,
    installedVersion,
    targetVersion,
    installError,
    installHint,
    installDetail,
    packageName,
    removing,
    removeError,
    onRemove,
}: {
    busy: boolean;
    mode: "install" | "update" | "current";
    installedVersion: number | null;
    targetVersion: number;
    installError: string;
    installHint: string;
    installDetail: string;
    packageName: string | null;
    removing: boolean;
    removeError: string;
    onRemove: () => void;
}): React.JSX.Element | null {
    if (installError) {
        return (
            <View style={styles.errorStrip}>
                <Text style={styles.errorCode}>[ ERROR: {installError} ]</Text>
                {installHint ? <Text style={styles.hint}>{installHint}</Text> : null}
                {installDetail ? <Text style={styles.detailMono}>{installDetail}</Text> : null}
                {installError === "SIGNATURE_MISMATCH" && packageName ? (
                    <SecondaryButton
                        label="REMOVE OLD COPY"
                        tone="danger"
                        busy={removing}
                        onPress={onRemove}
                        style={styles.removeBtn}
                    />
                ) : null}
                {removeError ? <Text style={styles.errorCode}>[ {removeError} ]</Text> : null}
            </View>
        );
    }

    if (!busy && mode === "update" && installedVersion != null) {
        return (
            <Text style={styles.updateNote}>
                You have build {installedVersion} · build {targetVersion} is available.
            </Text>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    errorStrip: {
        backgroundColor: colors.errorSubtle,
        borderLeftWidth: 2,
        borderLeftColor: colors.accent,
        borderRadius: radius.md,
        padding: space(3.5),
        marginTop: space(4),
    },
    errorCode: {
        fontFamily: mono,
        fontSize: 12,
        color: colors.accent,
        letterSpacing: 0.5,
        marginTop: space(1),
    },
    hint: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, marginTop: space(3) },
    detailMono: {
        fontFamily: mono,
        fontSize: 11,
        color: colors.textTertiary,
        lineHeight: 16,
        marginTop: space(3),
    },
    removeBtn: { marginTop: space(4) },
    updateNote: {
        fontFamily: mono,
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: space(3),
        letterSpacing: 0.3,
    },
});
