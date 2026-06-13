/**
 * Tester-app design tokens — shared with the Canopy web dashboard
 * (teal brand on a dark, refreshed canvas; Inter-style system sans; monospace
 * only for data). Keeps web + mobile reading as one product.
 */
export const colors = {
    bg: "#0E0E10",
    surface: "#161618",
    surfaceRaised: "#1E1E22",
    surfacePressed: "#1E1E22",
    border: "#262629",
    borderVisible: "#34343A",
    textPrimary: "#ECECEC",
    textSecondary: "#A1A1AA",
    textTertiary: "#71717A",
    textDisplay: "#FFFFFF",
    // Brand — teal
    brand: "#14B8A6",
    brandDeep: "#0D9488",
    brandHover: "#2DD4BF",
    brandSubtle: "rgba(20, 184, 166, 0.16)",
    onBrand: "#04201D",
    // Semantic
    accent: "#F87171",
    success: "#34D399",
    warning: "#FBBF24",
    info: "#60A5FA",
    successSubtle: "rgba(16, 185, 129, 0.16)",
    warningSubtle: "rgba(245, 158, 11, 0.16)",
    errorSubtle: "rgba(239, 68, 68, 0.16)",
    infoSubtle: "rgba(59, 130, 246, 0.16)",
    onPrimary: "#04201D",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** 4pt spacing scale. */
export function space(n: number): number {
    return n * 4;
}

/** Built-in Android monospace family — reliable without bundling a font. */
export const mono = "monospace";

/** Two-letter monogram for an app-icon avatar. */
export function monogram(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Deterministic subtle shade for an avatar background, from a name. */
export function avatarShade(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const v = 30 + (h % 14); // 30–43 → raised, low-contrast surfaces
    const hex = v.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
}

export type ChipTone = "neutral" | "brand" | "success" | "warning" | "error" | "info";

/** Background + foreground for a semantic status chip. */
export function chipColors(tone: ChipTone): { bg: string; fg: string } {
    switch (tone) {
        case "brand":
            return { bg: colors.brandSubtle, fg: colors.brandHover };
        case "success":
            return { bg: colors.successSubtle, fg: colors.success };
        case "warning":
            return { bg: colors.warningSubtle, fg: colors.warning };
        case "error":
            return { bg: colors.errorSubtle, fg: colors.accent };
        case "info":
            return { bg: colors.infoSubtle, fg: colors.info };
        default:
            return { bg: colors.surfaceRaised, fg: colors.textSecondary };
    }
}
