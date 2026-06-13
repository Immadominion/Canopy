/**
 * Native installer — the on-device piece that makes Canopy the trusted
 * installer (the TestFlight-equivalent). Delegates to the local Expo module
 * (modules/canopy-installer), which wraps Android's PackageInstaller (with the
 * REQUEST_INSTALL_PACKAGES permission) and hashes the APK natively.
 *
 * When the native side isn't built (Expo Go / JS-only), the module reports
 * `isAvailable() === false` and the install pipeline refuses to proceed rather
 * than installing anything unverified.
 */
import { CanopyInstaller, type InstallResult } from "../../modules/canopy-installer";

export type { InstallResult };

export interface CanopyInstallerApi {
    isAvailable(): boolean;
    canInstall(): boolean;
    getInstalledVersion(packageName: string): number | null;
    sha256OfFile(localUri: string): Promise<string>;
    installApk(localUri: string): Promise<InstallResult>;
    uninstall(packageName: string): Promise<InstallResult>;
}

export const installer: CanopyInstallerApi = CanopyInstaller;
