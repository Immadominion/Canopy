"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./landing.module.css";

type Mode = "scrub" | "loop" | "static";

/**
 * The pinned hero scene. On desktop the scroll position drives the video
 * playhead — a tall scene with a sticky 100vh stage. The clip is a crisp,
 * dense-keyframe encode so seeking stays smooth.
 *
 * Fallbacks: reduced-motion → static poster; touch/small screens → autoplay
 * loop (scrubbing a video on a phone is a battery + decode tax for no payoff).
 */
export function HeroScrub({ src, poster }: { src: string; poster: string }): React.JSX.Element {
    const [mode, setMode] = useState<Mode>("scrub");
    const sceneRef = useRef<HTMLElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const small = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
        setMode(reduce ? "static" : small ? "loop" : "scrub");
    }, []);

    useEffect(() => {
        if (mode !== "scrub") return;
        const vid = videoRef.current;
        const scene = sceneRef.current;
        if (!vid || !scene) return;

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
                vid.currentTime = now + diff * 0.25; // ease toward the scroll target
                raf = requestAnimationFrame(smooth);
            } else {
                vid.currentTime = target;
                raf = null;
            }
        };

        const update = (): void => {
            if (!dur) dur = vid.duration || 8;
            const rect = scene.getBoundingClientRect();
            const total = scene.offsetHeight - window.innerHeight;
            const p = clamp(-rect.top / total, 0, 1);
            const intro = 0.2; // skip any fade-from-black intro frame
            target = clamp(intro + p * (dur - intro - 0.1), 0, dur - 0.05);
            if (raf === null) raf = requestAnimationFrame(smooth);
        };

        const prime = (): void => {
            dur = vid.duration || 8;
            markReady();
            vid.pause();
            update();
        };

        vid.addEventListener("loadeddata", prime);
        vid.addEventListener("canplay", () => {
            dur = vid.duration || 8;
            markReady();
        });
        if (vid.readyState >= 2) prime();
        // A muted play() forces the browser to buffer; then we take over the playhead.
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
                { rootMargin: "120% 0px" },
            );
            io.observe(scene);
        }

        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            if (raf !== null) cancelAnimationFrame(raf);
            io?.disconnect();
        };
    }, [mode]);

    if (mode === "loop") {
        return (
            <div className={styles["videoPanel"]} aria-hidden="true">
                <video src={src} poster={poster} muted loop autoPlay playsInline preload="metadata" />
            </div>
        );
    }

    if (mode === "static") {
        return (
            <div className={styles["videoPanel"]}>
                <img src={poster} alt="The Canopy app installing a verified beta build on a Solana Mobile device." />
            </div>
        );
    }

    return (
        <section className={styles["scene"]} ref={sceneRef} aria-hidden="true">
            <div className={styles["sceneSticky"]}>
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
        </section>
    );
}
