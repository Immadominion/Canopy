/**
 * Root layout — mounts <CanopyProvider> at the app root.
 *
 * CanopyProvider must wrap all navigation so that useCanopy(),
 * useCanopyTransact(), and useRemoteConfig() are available on every screen.
 *
 * The `config` object is sourced from EXPO_PUBLIC_ environment variables so
 * the API key and app ID stay out of source control.
 */
import React from "react";
import { Stack } from "expo-router";
import { CanopyProvider } from "@canopy/react-native";
import Constants from "expo-constants";

const config = {
    apiKey: process.env.EXPO_PUBLIC_CANOPY_API_KEY ?? "",
    appId: process.env.EXPO_PUBLIC_CANOPY_APP_ID ?? "",
    appVersion: Constants.expoConfig?.version ?? "1.0.0",
    // Override ingest URL for local development — leave unset for production.
    ...(process.env.EXPO_PUBLIC_CANOPY_INGEST_URL
        ? { ingestUrl: process.env.EXPO_PUBLIC_CANOPY_INGEST_URL }
        : {}),
};

export default function RootLayout(): React.JSX.Element {
    return (
        <CanopyProvider config={config}>
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: "#000000" },
                    headerTintColor: "#FFFFFF",
                    headerTitleStyle: { fontFamily: "SpaceGrotesk-Medium" },
                    contentStyle: { backgroundColor: "#000000" },
                }}
            >
                <Stack.Screen name="index" options={{ title: "Canopy Demo" }} />
            </Stack>
        </CanopyProvider>
    );
}
