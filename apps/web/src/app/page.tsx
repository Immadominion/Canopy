import type { Metadata } from "next";

import { Landing } from "@/components/landing/landing";
import { getSessionWallet } from "@/lib/auth/session";

const title = "Canopy — Beta testing for Solana Mobile";
const description =
    "Distribute private beta builds to wallet-allowlisted testers, verify every install on-device, and get wallet-keyed analytics. Beta testing for Solana Mobile.";

// Public marketing page — override the dashboard layout's no-index default.
export const metadata: Metadata = {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: {
        title,
        description,
        type: "website",
        siteName: "Canopy",
        images: [{ url: "/canopy-hero-poster.jpg", width: 1600, height: 900, alt: "Canopy" }],
    },
    twitter: {
        card: "summary_large_image",
        title,
        description,
        images: ["/canopy-hero-poster.jpg"],
    },
};

/**
 * Root marketing landing page. Public for everyone; the nav CTA points to the
 * dashboard when signed in, otherwise to sign-in.
 */
export default async function RootPage() {
    const session = await getSessionWallet();
    return <Landing authed={!!session} />;
}
