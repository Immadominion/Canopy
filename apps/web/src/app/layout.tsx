import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { WalletProviderWrapper } from "@/components/wallet/wallet-provider";
import "./globals.css";

// Canopy typefaces — Inter for UI, JetBrains Mono for data/addresses/hashes
const inter = Inter({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800"],
    variable: "--font-inter",
    display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-jbmono",
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
            className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
        >
            <body className="bg-nd-black text-nd-text-primary font-body antialiased min-h-screen">
                <WalletProviderWrapper>{children}</WalletProviderWrapper>
            </body>
        </html>
    );
}
