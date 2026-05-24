import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node24",
    outDir: "dist",
    clean: true,
    dts: false,
    banner: {
        js: "#!/usr/bin/env node",
    },
    // Keep deps external — they are resolved at runtime from node_modules.
    // Bundling CJS deps (chalk, ora, commander) into ESM would break require() shims.
    external: ["chalk", "ora", "commander"],
});
