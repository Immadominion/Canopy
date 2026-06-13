// Project-level autolinking override — see apps/tester/react-native.config.js.
// In this pnpm monorepo, expo-modules-autolinking can't load expo's own
// react-native.config.js from Gradle and falls back to the legacy
// `expo.core.ExpoModulesPackage` (which doesn't exist in SDK 52). Pin the
// modern class so a rebuild doesn't break.
module.exports = {
    dependencies: {
        expo: {
            platforms: {
                android: {
                    packageImportPath: "import expo.modules.ExpoModulesPackage;",
                },
            },
        },
    },
};
