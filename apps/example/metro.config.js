// Metro config for Canopy monorepo.
// Watches the workspace root so that Metro can resolve workspace packages
// such as @canopy/react-native from packages/sdk.
//
// Reference: https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo (so that Metro can hot-reload workspace packages).
config.watchFolders = [workspaceRoot];

// Let Metro resolve workspace packages from both the app's node_modules and
// the workspace root's node_modules.
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
