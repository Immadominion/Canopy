"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { RuntimeLoader, StateMachineInputType, useRive } from "@rive-app/react-canvas";

import styles from "./landing.module.css";

// Self-host the Rive WASM (the CDN default is blocked by our CSP). Served from
// /public so connect-src 'self' is satisfied and it works offline.
if (typeof window !== "undefined") {
    RuntimeLoader.setWasmUrl("/rive.wasm");
}

/**
 * A Rive animation in a solution-row visual.
 *
 *  - Lazy-mounted: the .riv (and the Rive WASM) only load once the row is near
 *    the viewport, so a 2MB asset doesn't block first paint.
 *  - Plays the file's first state machine on load.
 *  - `reactOnView`: when the row scrolls into view, fire every trigger input and
 *    set every boolean input true — so a "reacts when you reach it" animation
 *    plays without us hard-coding its (unknown) input name.
 */
export function RiveAnim({
    src,
    reactOnView = false,
    className,
}: {
    src: string;
    reactOnView?: boolean;
    className?: string | undefined;
}): React.JSX.Element {
    const hostRef = useRef<HTMLDivElement>(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setShow(true);
                    io.disconnect();
                }
            },
            { rootMargin: "200% 0px" },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <div ref={hostRef} className={className}>
            {show ? <RiveInner src={src} reactOnView={reactOnView} hostRef={hostRef} /> : null}
        </div>
    );
}

function RiveInner({
    src,
    reactOnView,
    hostRef,
}: {
    src: string;
    reactOnView: boolean;
    hostRef: RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
    const { rive, RiveComponent } = useRive({ src, autoplay: false });

    // Play the first state machine once the file is ready.
    useEffect(() => {
        if (!rive) return;
        const sm = rive.stateMachineNames[0];
        if (sm) {
            try {
                rive.play(sm);
            } catch {
                /* no state machine to play */
            }
        }
    }, [rive]);

    // Stateful reaction: fire the machine's inputs when scrolled into view.
    useEffect(() => {
        if (!reactOnView || !rive) return;
        const el = hostRef.current;
        if (!el) return;
        let fired = false;
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (!e.isIntersecting || fired) return;
                    fired = true;
                    const sm = rive.stateMachineNames[0];
                    if (!sm) return;
                    let inputs;
                    try {
                        inputs = rive.stateMachineInputs(sm);
                    } catch {
                        return;
                    }
                    (inputs ?? []).forEach((inp) => {
                        try {
                            if (inp.type === StateMachineInputType.Trigger) inp.fire();
                            else if (inp.type === StateMachineInputType.Boolean) inp.value = true;
                        } catch {
                            /* input not settable */
                        }
                    });
                });
            },
            { threshold: 0.45 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [rive, reactOnView, hostRef]);

    return <RiveComponent className={styles["riveCanvas"]} />;
}
