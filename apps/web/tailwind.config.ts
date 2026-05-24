import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            // Nothing Design System tokens
            colors: {
                // Dark mode (primary)
                "nd-black": "#000000",
                "nd-surface": "#111111",
                "nd-surface-raised": "#1A1A1A",
                "nd-border": "#222222",
                "nd-border-visible": "#333333",
                "nd-text-disabled": "#666666",
                "nd-text-secondary": "#999999",
                "nd-text-primary": "#E8E8E8",
                "nd-text-display": "#FFFFFF",
                "nd-accent": "#D71921",
                "nd-accent-subtle": "rgba(215, 25, 33, 0.15)",
                "nd-success": "#4A9E5C",
                "nd-warning": "#D4A843",
                "nd-interactive": "#5B9BF6",
            },
            fontFamily: {
                // Nothing Design System typefaces
                display: ["var(--font-doto)", "Space Mono", "monospace"],
                body: ["var(--font-space-grotesk)", "DM Sans", "system-ui", "sans-serif"],
                mono: ["var(--font-space-mono)", "JetBrains Mono", "SF Mono", "monospace"],
            },
            fontSize: {
                // Nothing Design type scale
                "nd-display-xl": ["72px", { lineHeight: "1.0", letterSpacing: "-0.03em" }],
                "nd-display-lg": ["48px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
                "nd-display-md": ["36px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
                "nd-heading": ["24px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
                "nd-subheading": ["18px", { lineHeight: "1.3", letterSpacing: "0" }],
                "nd-body": ["16px", { lineHeight: "1.5", letterSpacing: "0" }],
                "nd-body-sm": ["14px", { lineHeight: "1.5", letterSpacing: "0.01em" }],
                "nd-caption": ["12px", { lineHeight: "1.4", letterSpacing: "0.04em" }],
                "nd-label": ["11px", { lineHeight: "1.2", letterSpacing: "0.08em" }],
            },
            spacing: {
                "nd-2xs": "2px",
                "nd-xs": "4px",
                "nd-sm": "8px",
                "nd-md": "16px",
                "nd-lg": "24px",
                "nd-xl": "32px",
                "nd-2xl": "48px",
                "nd-3xl": "64px",
                "nd-4xl": "96px",
            },
            borderRadius: {
                "nd-card": "12px",
                "nd-card-compact": "8px",
                "nd-technical": "4px",
                "nd-pill": "999px",
            },
            transitionTimingFunction: {
                "nd-standard": "cubic-bezier(0.25, 0.1, 0.25, 1)",
            },
            backgroundImage: {
                // Nothing Design dot-grid motif
                "nd-dot-grid":
                    "radial-gradient(circle, #333333 1px, transparent 1px)",
                "nd-dot-grid-subtle":
                    "radial-gradient(circle, #222222 0.5px, transparent 0.5px)",
            },
            backgroundSize: {
                "nd-dot-16": "16px 16px",
                "nd-dot-12": "12px 12px",
            },
        },
    },
    plugins: [],
    // Dark mode via class strategy (we control the theme)
    darkMode: "class",
};

export default config;
