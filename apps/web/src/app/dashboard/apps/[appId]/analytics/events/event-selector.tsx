"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface Props {
    eventNames: string[];
    selectedEvent: string | null;
    appId: string;
}

/**
 * Client component: event name selector.
 * When an event is selected it updates the URL search params, triggering
 * a server re-render of the properties table.
 */
export default function EventSelector({ eventNames, selectedEvent, appId: _appId }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleSelect = useCallback(
        (name: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("event", name);
            router.push(pathname + "?" + params.toString());
        },
        [pathname, router, searchParams]
    );

    if (eventNames.length === 0) {
        return (
            <div className="border-t border-nd-border pt-nd-xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em]">
                    NO EVENTS RECORDED YET
                </p>
                <p className="font-body text-nd-body-sm text-nd-text-secondary mt-nd-sm">
                    Install the{" "}
                    <code className="font-mono text-nd-text-secondary">@canopy/react-native</code> SDK in
                    your app to start capturing analytics events.
                </p>
            </div>
        );
    }

    return (
        <div>
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-md">
                SELECT EVENT
            </p>
            <div className="border-t border-nd-border">
                {eventNames.map((name) => {
                    const isSelected = name === selectedEvent;
                    return (
                        <button
                            key={name}
                            type="button"
                            onClick={() => handleSelect(name)}
                            className={
                                "w-full text-left border-b border-nd-border py-nd-md px-0 flex items-center justify-between group transition-colors " +
                                (isSelected ? "cursor-default" : "hover:bg-transparent cursor-pointer")
                            }
                        >
                            <span
                                className={
                                    "font-mono text-nd-body-sm uppercase tracking-[0.08em] transition-colors " +
                                    (isSelected ? "text-nd-text-display" : "text-nd-text-secondary group-hover:text-nd-text-primary")
                                }
                            >
                                {name}
                            </span>
                            {isSelected && (
                                <span className="font-mono text-nd-label text-nd-text-disabled">SELECTED</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
