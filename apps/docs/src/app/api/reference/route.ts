import { ApiReference } from "@scalar/nextjs-api-reference";

/**
 * GET /api/reference
 *
 * Serves the interactive Scalar API reference UI, loaded from the bundled
 * OpenAPI spec at /openapi.yaml.
 */
const handler = ApiReference({
    spec: {
        url: "/openapi.yaml",
    },
    theme: "default",
    darkMode: true,
    // Nothing Design palette overrides
    customCss: `
    :root {
      --scalar-background-1: #000000;
      --scalar-background-2: #0a0a0a;
      --scalar-background-3: #111111;
      --scalar-color-1: #e8e8e8;
      --scalar-color-2: #aaaaaa;
      --scalar-color-3: #666666;
      --scalar-color-accent: #d71921;
      --scalar-border-color: #222222;
      --scalar-font: 'Space Grotesk', system-ui, sans-serif;
      --scalar-font-code: 'Space Mono', 'Courier New', monospace;
    }
  `,
    layout: "modern",
});

export { handler as GET };
