// Metro config for the Canopy monorepo.
// Watches the workspace root so Metro can resolve workspace packages such as
// @canopy/react-native from packages/sdk.
//
// Reference: https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
];

// Force a SINGLE react / react-native in the bundle — pnpm can install the same
// version twice in different peer contexts (e.g. a react@19-bound react-native
// from the web wallet stack), and two Reacts cause an element `$$typeof`
// mismatch ("Objects are not valid as a React child"). Redirect every
// react / react-native import to this app's copy.
const FORCE_SINGLE = {
    react: path.resolve(projectRoot, "node_modules/react"),
    "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
    for (const [name, dir] of Object.entries(FORCE_SINGLE)) {
        if (moduleName === name) {
            return context.resolveRequest(context, dir, platform);
        }
        if (moduleName.startsWith(`${name}/`)) {
            return context.resolveRequest(context, dir + moduleName.slice(name.length), platform);
        }
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
