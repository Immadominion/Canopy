import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";

export const metadata: Metadata = {
    title: {
        template: "%s — Canopy Docs",
        default: "Canopy Docs",
    },
    description:
        "Developer documentation for Canopy — the SaaS devops platform for Solana Mobile.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <RootProvider
                    theme={{
                        // Force dark mode — Canopy Docs is dark-only
                        defaultTheme: "dark",
                        attribute: "class",
                        disableTransitionOnChange: true,
                    }}
                >
                    {children}
                </RootProvider>
            </body>
        </html>
    );
}
