"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Fully-qualified package name of the Canopy tester app on the Solana dApp
 * Store. Used both for the `canopy://` open attempt and the store-install
 * deeplink (`solanadappstore://details?id=...`).
 */
const TESTER_PACKAGE = "app.canopy.tester";

/**
 * OpenInCanopy — the trusted, primary install path for a beta.
 *
 * The Canopy tester app is installed once from the publisher-signed Solana dApp
 * Store, then becomes the trusted installer for every beta: it fetches the APK
 * over an authenticated channel and verifies its SHA-256 before installing.
 * This avoids the deepfake/phishing vector of downloading a raw .apk from a web
 * page.
 *
 * Behaviour:
 *  - Tap "Open in Canopy" → attempt `canopy://beta/<trackId>`.
 *  - If the app isn't installed (the deeplink does nothing), the "Install
 *    Canopy" action routes to the dApp Store listing.
 *  - On non-Android browsers the app can't run; we surface that and point to the
 *    advanced web fallback below it on the page.
 */
export function OpenInCanopy({ trackId }: { trackId: string }) {
    const [isAndroid, setIsAndroid] = useState(false);
    const [triedOpen, setTriedOpen] = useState(false);

    useEffect(() => {
        setIsAndroid(/android/i.test(navigator.userAgent));
    }, []);

    const openApp = useCallback(() => {
        setTriedOpen(true);
        // Attempt to hand off to the installed Canopy app. If it isn't installed
        // the navigation is a no-op and the "Install Canopy" CTA stays visible.
        window.location.href = `canopy://beta/${trackId}`;
    }, [trackId]);

    const installCanopy = useCallback(() => {
        window.location.href = `solanadappstore://details?id=${TESTER_PACKAGE}`;
    }, []);

    return (
        <div>
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-sm">
                INSTALL WITH CANOPY
            </p>
            <p className="font-body text-nd-body-sm text-nd-text-secondary mb-nd-lg">
                The Canopy app installs betas safely — it verifies each build against its
                signed fingerprint before installing. Recommended.
            </p>

            <button
                onClick={openApp}
                className="w-full font-mono text-nd-label text-nd-black bg-nd-text-display uppercase tracking-[0.08em] px-nd-2xl py-nd-md hover:opacity-90 transition-opacity"
            >
                OPEN IN CANOPY →
            </button>

            {triedOpen && (
                <button
                    onClick={installCanopy}
                    className="mt-nd-md w-full font-mono text-nd-label text-nd-text-secondary uppercase tracking-[0.08em] border border-nd-border px-nd-lg py-nd-md hover:border-nd-border-visible transition-colors"
                >
                    DON&apos;T HAVE CANOPY? INSTALL FROM DAPP STORE →
                </button>
            )}

            {!isAndroid && (
                <p className="mt-nd-md font-mono text-nd-caption text-nd-text-disabled leading-relaxed">
                    THE CANOPY APP IS ANDROID-ONLY (SOLANA MOBILE / SEEKER). ON OTHER DEVICES,
                    USE THE ADVANCED DOWNLOAD BELOW.
                </p>
            )}
        </div>
    );
}
