// Project-level autolinking override.
//
// In this pnpm monorepo, expo-modules-autolinking's `react-native-config` fails
// to load `expo`'s own `react-native.config.js` from the Gradle process (its
// `findProjectRootSync()` resolves wrong), so it falls back to a derived import
// of the legacy class `expo.core.ExpoModulesPackage` — which doesn't exist in
// SDK 52 and breaks the build (`cannot find symbol ExpoModulesPackage`).
//
// expo-modules-autolinking merges `dependencies[name]` from this project config
// over the derived value, so we pin the correct modern class here.
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
