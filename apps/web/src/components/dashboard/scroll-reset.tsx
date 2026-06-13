"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Resets the dashboard content panel's scroll to the top on route change.
 *
 * The panel (not the window) is the scroll container and lives in the persistent
 * dashboard layout, so navigating between pages would otherwise keep the
 * previous page's scroll offset. This finds the panel by its `data-scroll-root`
 * attribute (the closest such ancestor) and scrolls it to the top whenever the
 * pathname changes.
 */
export function ScrollReset(): React.JSX.Element {
    const pathname = usePathname();
    const anchor = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const root = anchor.current?.closest<HTMLElement>("[data-scroll-root]");
        if (root) root.scrollTop = 0;
    }, [pathname]);

    return <span ref={anchor} aria-hidden className="hidden" />;
}
