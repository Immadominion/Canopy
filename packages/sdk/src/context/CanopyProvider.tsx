/**
 * CanopyProvider — mounts the SDK into a React Native app.
 *
 * Place this at the root of your component tree, outside your navigation.
 *
 * @example
 * ```tsx
 * <CanopyProvider config={{ apiKey: 'cny_...', appId: 'app_...' }}>
 *   <App />
 * </CanopyProvider>
 * ```
 *
 * SDK invariants enforced here:
 * - No network requests before this component mounts
 * - All SDK-internal errors are caught and discarded (never crash host app)
 * - Flush on: 30s interval, 50-event threshold, AppState → background
 * - Wallet addresses are hashed on device before any event is queued
 */
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";
import type { CanopyConfig, CanopyEvent } from "@canopy/types";
import { loadQueue, persistQueue, clearQueue } from "../queue";
import { flushEvents } from "../flush";
import { generateId } from "../id";

// ---- Context ---------------------------------------------------------------

export interface CanopyContextValue {
    config: CanopyConfig;
    /** SHA-256 hash of the connected wallet address. Null until identify() is called. */
    walletHash: string | null;
    sessionId: string;
    setWalletHash: (hash: string | null) => void;
    enqueue: (event: CanopyEvent) => void;
}

const CanopyContext = createContext<CanopyContextValue | null>(null);

// ---- Provider --------------------------------------------------------------

export interface CanopyProviderProps {
    config: CanopyConfig;
    children: React.ReactNode;
}

export function CanopyProvider({
    config,
    children,
}: CanopyProviderProps): React.JSX.Element {
    const [walletHash, setWalletHash] = useState<string | null>(null);

    // Stable refs — changes do not trigger effect re-runs
    const sessionIdRef = useRef<string>(generateId());
    const queueRef = useRef<CanopyEvent[]>([]);
    const configRef = useRef<CanopyConfig>(config);
    const walletHashRef = useRef<string | null>(null);
    const appStateRef = useRef<AppStateStatus>("active");
    const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Keep configRef and walletHashRef in sync without triggering effect re-runs
    configRef.current = config;
    walletHashRef.current = walletHash;

    const flushThreshold = config.flushThreshold ?? 50;
    const flushIntervalMs = config.flushInterval ?? 30_000;

    // ---- flush ---------------------------------------------------------------

    const flush = useCallback(async (): Promise<void> => {
        if (queueRef.current.length === 0) return;
        const toFlush = [...queueRef.current];
        queueRef.current = [];
        await clearQueue();
        try {
            await flushEvents(toFlush, configRef.current);
            if (configRef.current.debug === true) {
                console.log("[Canopy] Flushed " + String(toFlush.length) + " events");
            }
        } catch {
            // Re-queue failed events at the front so they are retried next flush
            queueRef.current = [...toFlush, ...queueRef.current];
            void persistQueue(queueRef.current);
            if (configRef.current.debug === true) {
                console.log("[Canopy] Flush failed, events re-queued");
            }
        }
    }, []);

    // ---- enqueue -------------------------------------------------------------

    const enqueue = useCallback(
        (event: CanopyEvent): void => {
            queueRef.current = [...queueRef.current, event];
            void persistQueue(queueRef.current);
            if (queueRef.current.length >= flushThreshold) {
                void flush();
            }
        },
        [flush, flushThreshold],
    );

    // ---- Load persisted queue on mount ---------------------------------------

    useEffect(() => {
        let mounted = true;
        void loadQueue().then((persisted) => {
            if (mounted && persisted.length > 0) {
                queueRef.current = persisted;
            }
        });
        return (): void => {
            mounted = false;
        };
    }, []);

    // ---- Flush interval ------------------------------------------------------

    useEffect(() => {
        flushIntervalRef.current = setInterval(() => {
            void flush();
        }, flushIntervalMs);
        return (): void => {
            if (flushIntervalRef.current !== null) {
                clearInterval(flushIntervalRef.current);
            }
        };
    }, [flush, flushIntervalMs]);

    // ---- AppState listener — flush on background ----------------------------

    useEffect(() => {
        const subscription = AppState.addEventListener(
            "change",
            (nextState: AppStateStatus): void => {
                if (appStateRef.current === "active" && nextState === "background") {
                    void flush();
                }
                appStateRef.current = nextState;
            },
        );
        return (): void => {
            subscription.remove();
        };
    }, [flush]);

    // ---- Track app_open on mount ---------------------------------------------

    useEffect(() => {
        enqueue({
            id: generateId(),
            name: "app_open",
            walletHash: walletHashRef.current ?? "",
            sessionId: sessionIdRef.current,
            properties: null,
            sdkVersion: "0.1.0",
            appVersion: configRef.current.appVersion ?? null,
            platform: Platform.OS,
            isSeeker: null,
            hasGenesisToken: null,
            skrBalanceTier: null,
            timestamp: new Date().toISOString(),
        });
    }, []); // intentionally runs once on mount — all accessed values are stable refs

    // ---- Context value -------------------------------------------------------

    const contextValue: CanopyContextValue = {
        config,
        walletHash,
        sessionId: sessionIdRef.current,
        setWalletHash,
        enqueue,
    };

    return (
        <CanopyContext.Provider value={contextValue}>
            {children}
        </CanopyContext.Provider>
    );
}

// ---- Internal context accessor (for hooks) --------------------------------

export function useCanopyContext(): CanopyContextValue {
    const ctx = useContext(CanopyContext);
    if (!ctx) {
        throw new Error(
            "useCanopyContext must be used within a <CanopyProvider>",
        );
    }
    return ctx;
}
