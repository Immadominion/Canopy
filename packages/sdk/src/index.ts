/**
 * @canopy/react-native — Canopy SDK for Solana Mobile / Seeker
 *
 * @example
 * ```tsx
 * import { CanopyProvider, useCanopy } from '@canopy/react-native';
 *
 * // 1. Wrap your app root
 * <CanopyProvider config={{ apiKey: 'cny_...', appId: 'app_...' }}>
 *   <YourApp />
 * </CanopyProvider>
 *
 * // 2. Track events from any component
 * const { track, identify } = useCanopy();
 * track('swap_initiated', { dex: 'jupiter' });
 * await identify(walletPublicKey.toBase58());
 *
 * // 3. Wrap MWA transact() for automatic wallet analytics
 * const canopyTransact = useCanopyTransact();
 * await canopyTransact(async (wallet) => { ... });
 * ```
 */

export { CanopyProvider } from "./context/CanopyProvider";
export type { CanopyProviderProps, CanopyContextValue } from "./context/CanopyProvider";

export { useCanopy } from "./hooks/useCanopy";
export type { UseCanopyReturn } from "./hooks/useCanopy";

export { useCanopyTransact } from "./hooks/useCanopyTransact";

export { useRemoteConfig } from "./hooks/useRemoteConfig";
