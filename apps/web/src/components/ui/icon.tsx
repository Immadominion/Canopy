"use client";

/**
 * Phosphor icon re-export, wrapped to be accessible by default.
 *
 * Phosphor icons call `useContext` internally, so they can't render inside React
 * Server Components directly. Re-exporting them from a "use client" module turns
 * them into client references, so both server and client components can import
 * icons from here.
 *
 * Each icon is wrapped so it is DECORATIVE by default — `aria-hidden` and not
 * focusable — so a screen reader doesn't announce it, or double-announce it next
 * to a visible text label. An icon that is the SOLE content of a control (an
 * icon-only button/link) must be given an explicit `aria-label` at the call
 * site; that un-hides the icon and names the control.
 */
import {
    forwardRef,
    type ForwardRefExoticComponent,
    type RefAttributes,
} from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
    Package as RawPackage,
    ChartLine as RawChartLine,
    Wrench as RawWrench,
    GearSix as RawGearSix,
    SignOut as RawSignOut,
    UploadSimple as RawUploadSimple,
    Plus as RawPlus,
    ArrowRight as RawArrowRight,
    CaretRight as RawCaretRight,
    CaretDown as RawCaretDown,
    Trash as RawTrash,
    ArrowClockwise as RawArrowClockwise,
    ShieldCheck as RawShieldCheck,
    Check as RawCheck,
    X as RawX,
    DeviceMobile as RawDeviceMobile,
    Detective as RawDetective,
    WarningCircle as RawWarningCircle,
    Wallet as RawWallet,
    DownloadSimple as RawDownloadSimple,
    Clock as RawClock,
    Bell as RawBell,
    Users as RawUsers,
    Fingerprint as RawFingerprint,
    Sparkle as RawSparkle,
    ChatText as RawChatText,
} from "@phosphor-icons/react";

type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

function decorative(Icon: IconComponent): IconComponent {
    const WrappedIcon = forwardRef<SVGSVGElement, IconProps>((props, ref) => {
        const labelled = props["aria-label"] != null || props["aria-labelledby"] != null;
        return (
            <Icon
                ref={ref}
                aria-hidden={labelled ? undefined : true}
                focusable="false"
                {...props}
            />
        );
    });
    WrappedIcon.displayName = "Icon";
    return WrappedIcon;
}

export const Package = decorative(RawPackage);
export const ChartLine = decorative(RawChartLine);
export const Wrench = decorative(RawWrench);
export const GearSix = decorative(RawGearSix);
export const SignOut = decorative(RawSignOut);
export const UploadSimple = decorative(RawUploadSimple);
export const Plus = decorative(RawPlus);
export const ArrowRight = decorative(RawArrowRight);
export const CaretRight = decorative(RawCaretRight);
export const CaretDown = decorative(RawCaretDown);
export const Trash = decorative(RawTrash);
export const ArrowClockwise = decorative(RawArrowClockwise);
export const ShieldCheck = decorative(RawShieldCheck);
export const Check = decorative(RawCheck);
export const X = decorative(RawX);
export const DeviceMobile = decorative(RawDeviceMobile);
export const Detective = decorative(RawDetective);
export const WarningCircle = decorative(RawWarningCircle);
export const Wallet = decorative(RawWallet);
export const DownloadSimple = decorative(RawDownloadSimple);
export const Clock = decorative(RawClock);
export const Bell = decorative(RawBell);
export const Users = decorative(RawUsers);
export const Fingerprint = decorative(RawFingerprint);
export const Sparkle = decorative(RawSparkle);
export const ChatText = decorative(RawChatText);
