// Use expo's re-export (expo is a direct dep) — @expo/config-plugins is only a
// transitive dep here and would not resolve under pnpm's strict node_modules.
const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Config plugin: sign the Android RELEASE build with our real upload keystore
 * instead of the debug key.
 *
 * `expo prebuild` regenerates android/, which by default points the release
 * buildType at the debug signingConfig. This plugin re-injects a `release`
 * signingConfig on every prebuild, reading credentials from gradle properties
 * (CANOPY_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD) set
 * in ~/.gradle/gradle.properties — so no secret ever lives in the repo. If those
 * properties are absent (e.g. a fresh CI checkout) the release config is empty
 * and the build still configures.
 */
module.exports = function withReleaseSigning(config) {
    return withAppBuildGradle(config, (cfg) => {
        if (cfg.modResults.language !== "groovy") {
            throw new Error("withReleaseSigning: expected a groovy build.gradle");
        }
        let gradle = cfg.modResults.contents;

        // Idempotent — skip if already injected.
        if (gradle.includes("CANOPY_UPLOAD_STORE_FILE")) return cfg;

        // 1. Add a `release` signingConfig next to `debug`.
        gradle = gradle.replace(
            "signingConfigs {",
            `signingConfigs {
        release {
            if (project.hasProperty('CANOPY_UPLOAD_STORE_FILE')) {
                storeFile file(CANOPY_UPLOAD_STORE_FILE)
                storePassword CANOPY_UPLOAD_STORE_PASSWORD
                keyAlias CANOPY_UPLOAD_KEY_ALIAS
                keyPassword CANOPY_UPLOAD_KEY_PASSWORD
            }
        }`,
        );

        // 2. Point the release buildType at it (leaving debug on the debug key).
        gradle = gradle.replace(
            /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
            "$1signingConfig signingConfigs.release",
        );

        cfg.modResults.contents = gradle;
        return cfg;
    });
};
