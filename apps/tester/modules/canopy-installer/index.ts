/**
 * canopy-installer — local Expo native module.
 *
 * Wraps Android's PackageInstaller (the trusted-install primitive) and hashes
 * the downloaded APK natively. Autolinked by Expo from `modules/` during
 * prebuild; until the native side is built, `requireOptionalNativeModule`
 * returns null and `isAvailable()` is false (the JS app still runs).
 */
import { requireOptionalNativeModule } from "expo-modules-core";

export interface InstallResult {
    status: "installed" | "removed" | "user_cancelled" | "failed";
    message?: string | null;
}

interface NativeModule {
    canInstall(): boolean;
    getInstalledVersion(packageName: string): number | null;
    sha256OfFile(localUri: string): Promise<string>;
    installApk(localUri: string): Promise<InstallResult>;
    uninstall(packageName: string): Promise<InstallResult>;
}

const native = requireOptionalNativeModule<NativeModule>("CanopyInstaller");

const UNAVAILABLE = "INSTALLER_NATIVE_MODULE_UNAVAILABLE";

export const CanopyInstaller = {
    /** True once the native module is built into the app (false in Expo Go / JS-only). */
    isAvailable(): boolean {
        return native != null;
    },
    /** Whether the app already holds the "install unknown apps" permission. */
    canInstall(): boolean {
        return native?.canInstall() ?? false;
    },
    /** Installed versionCode of a package, or null if not installed / unknown. */
    getInstalledVersion(packageName: string): number | null {
        return native?.getInstalledVersion(packageName) ?? null;
    },
    sha256OfFile(localUri: string): Promise<string> {
        if (!native) return Promise.reject(new Error(UNAVAILABLE));
        return native.sha256OfFile(localUri);
    },
    installApk(localUri: string): Promise<InstallResult> {
        if (!native) return Promise.resolve({ status: "failed", message: UNAVAILABLE });
        return native.installApk(localUri);
    },
    /** Uninstall a package (shows the OS uninstall confirmation). */
    uninstall(packageName: string): Promise<InstallResult> {
        if (!native) return Promise.resolve({ status: "failed", message: UNAVAILABLE });
        return native.uninstall(packageName);
    },
};
