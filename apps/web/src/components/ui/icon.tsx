"use client";

/**
 * Phosphor icon re-export.
 *
 * Phosphor icons call `useContext` internally, so they can't render inside React
 * Server Components directly. Re-exporting them from a "use client" module turns
 * them into client references, so both server and client components can import
 * icons from here.
 */
export {
    Package,
    ChartLine,
    Wrench,
    GearSix,
    SignOut,
    UploadSimple,
    Plus,
    ArrowRight,
    CaretRight,
    CaretDown,
    Trash,
    ArrowClockwise,
    ShieldCheck,
    Check,
    X,
    DeviceMobile,
    Detective,
    WarningCircle,
    Wallet,
    DownloadSimple,
    Clock,
    Bell,
    Users,
    Fingerprint,
    Sparkle,
} from "@phosphor-icons/react";
