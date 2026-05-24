// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
const config = [
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        rules: {
            // Enforce explicit return types on exported functions
            "@typescript-eslint/explicit-module-boundary-types": "error",
            // Disallow any
            "@typescript-eslint/no-explicit-any": "error",
            // No unused vars (with underscore prefix exception)
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            // Require consistent type imports
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { prefer: "type-imports", fixStyle: "inline-type-imports" },
            ],
            // No non-null assertions
            "@typescript-eslint/no-non-null-assertion": "error",
        },
    },
    {
        ignores: [
            "**/node_modules/**",
            "**/.next/**",
            "**/dist/**",
            "**/.turbo/**",
            "**/coverage/**",
            "**/*.config.js",
            "**/*.config.cjs",
            "eslint.config.mjs",
        ],
    },
];

export default config;
