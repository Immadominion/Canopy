"use client";

import { useEffect, useState } from "react";

import { RuntimeLoader, useRive } from "@rive-app/react-canvas";

import styles from "./landing.module.css";

// Self-host the Rive WASM (CDN is blocked by our CSP).
if (typeof window !== "undefined") {
    RuntimeLoader.setWasmUrl("/rive.wasm");
}

/**
 * Full-screen Rive loader shown on first paint and faded out once the page has
 * loaded (the heavy 4K hero buffers behind it). Renders the cream backdrop
 * server-side so there's no flash before the animation mounts.
 */
export function PageLoader(): React.JSX.Element | null {
    const [hidden, setHidden] = useState(false);
    const [mounted, setMounted] = useState(true);
    const { RiveComponent } = useRive({ src: "/rive/loader.riv", autoplay: true });

    // Hide once everything has loaded, with a small floor so it never just flashes.
    useEffect(() => {
        const start = performance.now();
        const done = (): void => {
            const wait = Math.max(0, 650 - (performance.now() - start));
            window.setTimeout(() => setHidden(true), wait);
        };
        if (document.readyState === "complete") done();
        else window.addEventListener("load", done, { once: true });
        const safety = window.setTimeout(() => setHidden(true), 9000); // never hang
        return () => {
            window.clearTimeout(safety);
            window.removeEventListener("load", done);
        };
    }, []);

    // Unmount after the fade so it stops capturing pointer events.
    useEffect(() => {
        if (!hidden) return;
        const t = window.setTimeout(() => setMounted(false), 600);
        return () => window.clearTimeout(t);
    }, [hidden]);

    if (!mounted) return null;

    return (
        <div className={`${styles["loader"]} ${hidden ? styles["loaderHidden"] : ""}`} aria-hidden="true">
            <div className={styles["loaderArt"]}>
                <RiveComponent />
            </div>
        </div>
    );
}
