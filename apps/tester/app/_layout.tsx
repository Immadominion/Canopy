/**
 * Root layout — mounts <CanopyProvider> so the SDK hooks (useCanopy,
 * useCanopyTransact) are available on every screen.
 */
import React from "react";
import { Stack } from "expo-router";
import { CanopyProvider } from "@canopy/react-native";

import { CANOPY_ANALYTICS } from "@/lib/config";
import { colors } from "@/ui/theme";

export default function RootLayout(): React.JSX.Element {
    return (
        <CanopyProvider config={CANOPY_ANALYTICS}>
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: colors.bg },
                    headerTintColor: colors.textPrimary,
                    headerShadowVisible: false,
                    headerTitleStyle: { color: colors.textPrimary },
                    contentStyle: { backgroundColor: colors.bg },
                }}
            >
                {/* index + connect render their own large titles. */}
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="connect" options={{ headerShown: false }} />
                {/* detail keeps the native header for the back chevron. */}
                <Stack.Screen name="beta/[trackId]" options={{ title: "", headerBackTitle: "Apps" }} />
                {/* feedback — a pushed screen, back to the detail. */}
                <Stack.Screen
                    name="beta/[trackId]/feedback"
                    options={{ title: "Send feedback", headerBackTitle: "Back" }}
                />
            </Stack>
        </CanopyProvider>
    );
}
