"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./landing.module.css";

type Mode = "scrub" | "loop" | "static";

/**
 * An in-row video whose playhead is driven by its own scroll position — as the
 * element travels through the viewport, the clip plays 0 → end (the hero
 * technique, but for a normal, non-pinned element). Falls back to an autoplay
 * loop on touch/small screens and to a static poster under reduced-motion.
 */
export function ScrubVideo({
    src,
    poster,
    className,
}: {
    src: string;
    poster: string;
    className?: string | undefined;
}): React.JSX.Element {
    const [mode, setMode] = useState<Mode>("scrub");
    const wrapRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const small = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
        setMode(reduce ? "static" : small ? "loop" : "scrub");
    }, []);

    useEffect(() => {
        if (mode !== "scrub") return;
        const vid = videoRef.current;
        const wrap = wrapRef.current;
        if (!vid || !wrap) return;

        let dur = 0;
        let target = 0;
        let raf: number | null = null;
        const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
        const markReady = (): void => vid.classList.add(styles["ready"] ?? "ready");

        const smooth = (): void => {
            if (!vid.paused) vid.pause();
            const now = vid.currentTime;
            const diff = target - now;
            if (Math.abs(diff) > 0.01) {
                vid.currentTime = now + diff * 0.22;
                raf = requestAnimationFrame(smooth);
            } else {
                vid.currentTime = target;
                raf = null;
            }
        };

        const update = (): void => {
            if (!dur) dur = vid.duration || 8;
            const rect = wrap.getBoundingClientRect();
            const vh = window.innerHeight;
            // 0 when the element's top sits at the viewport bottom; 1 once its
            // bottom has passed the viewport top.
            const p = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
            target = clamp(p * (dur - 0.05), 0, dur - 0.05);
            if (raf === null) raf = requestAnimationFrame(smooth);
        };

        const prime = (): void => {
            dur = vid.duration || 8;
            markReady();
            vid.pause();
            update();
        };

        vid.addEventListener("loadeddata", prime);
        if (vid.readyState >= 2) prime();
        vid.play()
            .then(() => {
                if (vid.readyState >= 2) vid.pause();
            })
            .catch(() => undefined);

        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        update();

        let io: IntersectionObserver | null = null;
        if ("IntersectionObserver" in window) {
            io = new IntersectionObserver(
                (entries) => {
                    entries.forEach((e) => {
                        if (e.isIntersecting && vid.readyState < 2) {
                            vid.load();
                            vid.play()
                                .then(() => vid.pause())
                                .catch(() => undefined);
                        }
                    });
                },
                { rootMargin: "160% 0px" },
            );
            io.observe(wrap);
        }

        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            if (raf !== null) cancelAnimationFrame(raf);
            io?.disconnect();
        };
    }, [mode]);

    if (mode === "static") {
        return (
            <div ref={wrapRef} className={className}>
                <img src={poster} alt="" />
            </div>
        );
    }

    if (mode === "loop") {
        return (
            <div ref={wrapRef} className={className}>
                <video src={src} poster={poster} muted loop autoPlay playsInline preload="metadata" />
            </div>
        );
    }

    return (
        <div ref={wrapRef} className={className}>
            <video
                ref={videoRef}
                className={styles["scrubVideo"]}
                src={src}
                poster={poster}
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
            />
        </div>
    );
}
