// Tailwind v4 is compiled through its PostCSS plugin. Without this, the
// `@import "tailwindcss"` in globals.css is a no-op and NO utility classes
// (nd-*, flex, spacing, etc.) are generated.
const config = {
    plugins: {
        "@tailwindcss/postcss": {},
    },
};

export default config;
