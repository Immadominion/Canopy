import type { Metadata } from "next";
import { Doto, Space_Grotesk, Space_Mono } from "next/font/google";

import { WalletProviderWrapper } from "@/components/wallet/wallet-provider";
import "./globals.css";

// Nothing Design System typefaces
const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    weight: ["300", "400", "500", "700"],
    variable: "--font-space-grotesk",
    display: "swap",
});

const spaceMono = Space_Mono({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-space-mono",
    display: "swap",
});

const doto = Doto({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-doto",
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        default: "Canopy",
        template: "%s | Canopy",
    },
    description: "Developer infrastructure for Solana Mobile apps",
    robots: {
        index: false, // Never index this dashboard
        follow: false,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`dark ${spaceGrotesk.variable} ${spaceMono.variable} ${doto.variable}`}
        >
            <body className="bg-nd-black text-nd-text-primary font-body antialiased min-h-screen">
                <WalletProviderWrapper>{children}</WalletProviderWrapper>
            </body>
        </html>
    );
}
