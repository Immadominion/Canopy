import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/main.ts"],
    format: ["cjs"],
    // Bundle all dependencies into a single dist/index.js.
    // GitHub Actions runners do not install node_modules from the action package —
    // the action must be fully self-contained.
    noExternal: [/.*/],
    minify: false,
    sourcemap: false,
    clean: true,
    target: "node24",
});
