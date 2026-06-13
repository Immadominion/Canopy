"use client";

import { useEffect } from "react";

/**
 * Section entrance reveals. Marks any `[data-reveal]` element visible once it
 * scrolls into view (one-shot). Honors prefers-reduced-motion by revealing
 * everything immediately. Renders nothing — it just wires the observer.
 */
export function RevealController(): null {
    useEffect(() => {
        const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
        if (els.length === 0) return;

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            els.forEach((el) => el.setAttribute("data-revealed", ""));
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.setAttribute("data-revealed", "");
                        io.unobserve(e.target);
                    }
                });
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
        );

        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, []);

    return null;
}
