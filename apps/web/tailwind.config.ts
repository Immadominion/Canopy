import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            // Canopy design tokens — dark, refreshed (teal brand)
            colors: {
                // Canvas + surfaces (soft near-black, raised cards)
                "nd-shell": "#0A1A16", // dark-teal frame + sidebar rail
                "nd-black": "#0E0E10", // content panel / standalone page bg
                "nd-surface": "#161618", // cards / panels
                "nd-surface-raised": "#1E1E22", // raised / hover surfaces
                "nd-border": "#262629", // hairline dividers
                "nd-border-visible": "#34343A", // stronger borders / inputs
                // Text ramp
                "nd-text-disabled": "#71717A",
                "nd-text-secondary": "#A1A1AA",
                "nd-text-primary": "#ECECEC",
                "nd-text-display": "#FFFFFF",
                // Brand — teal
                "nd-brand": "#14B8A6",
                "nd-brand-deep": "#0D9488",
                "nd-brand-hover": "#2DD4BF",
                "nd-brand-subtle": "rgba(20, 184, 166, 0.14)",
                "nd-on-brand": "#04201D", // text/icons on a teal fill
                // Destructive — red (reserved)
                "nd-accent": "#EF4444",
                "nd-accent-subtle": "rgba(239, 68, 68, 0.14)",
                // Semantic
                "nd-success": "#10B981",
                "nd-success-subtle": "rgba(16, 185, 129, 0.14)",
                "nd-warning": "#F59E0B",
                "nd-warning-subtle": "rgba(245, 158, 11, 0.14)",
                "nd-info": "#3B82F6",
                "nd-info-subtle": "rgba(59, 130, 246, 0.14)",
                // Back-compat alias (older usages of nd-interactive)
                "nd-interactive": "#3B82F6",
            },
            fontFamily: {
                // Canopy typefaces — Inter for UI, JetBrains Mono for data
                display: ["var(--font-inter)", "system-ui", "sans-serif"],
                body: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
                mono: ["var(--font-jbmono)", "JetBrains Mono", "SF Mono", "monospace"],
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
                "nd-lg": "16px",
                "nd-card": "12px",
                "nd-card-compact": "8px",
                "nd-technical": "6px",
                "nd-pill": "999px",
            },
            boxShadow: {
                // Subtle elevation — small offset, small blur, low opacity
                "nd-card": "0 2px 4px rgba(0,0,0,0.18)",
                "nd-float": "0 4px 10px rgba(0,0,0,0.2)",
                "nd-glow-brand": "0 2px 6px rgba(13,148,136,0.2)",
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
