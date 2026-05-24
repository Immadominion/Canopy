# Canopy Example App

A complete Expo (Android) reference app demonstrating every feature of the
`@canopy/react-native` SDK.

**Requires a physical Android device or Android emulator with an MWA-compatible
wallet installed (e.g. [Phantom](https://phantom.app/) or
[Solflare](https://solflare.com/)).**
iOS is not supported — Mobile Wallet Adapter is Android-only.

---

## What it demonstrates

| Feature | File | SDK API |
|---|---|---|
| Mount the SDK | `app/_layout.tsx` | `<CanopyProvider config={…}>` |
| Wallet connection | `src/hooks/useMobileWallet.ts` | `useCanopyTransact()` |
| Wallet identification | `src/hooks/useMobileWallet.ts` | `useCanopy().identify()` |
| Custom event tracking | `app/index.tsx` | `useCanopy().track()` |
| Remote config / feature flags | `app/index.tsx` | `useRemoteConfig(key, default)` |

---

## Tech stack

| Package | Version |
|---|---|
| Expo | ~52.0.0 |
| React Native | 0.76.x |
| @canopy/react-native | workspace:* |
| @solana-mobile/mobile-wallet-adapter-protocol | ^2.2.8 |

---

## Quick start

### 1 · Prerequisites

- Android Studio + Android SDK installed
- Android device or emulator running Android 11+
- An MWA-compatible wallet APK installed on the device/emulator
- Canopy account with an API key and app ID
  ([dashboard.canopy.app](https://dashboard.canopy.app))

### 2 · Install dependencies

From the **monorepo root**:

```bash
pnpm install
```

### 3 · Configure environment variables

```bash
cp apps/example/.env.example apps/example/.env.local
# Edit .env.local and fill in EXPO_PUBLIC_CANOPY_API_KEY and EXPO_PUBLIC_CANOPY_APP_ID
```

### 4 · Build and run

Build a custom development APK (required — Expo Go does not support MWA):

```bash
cd apps/example

# Build locally (requires Android Studio):
npx eas build --profile development --platform android --local

# Or use EAS cloud (requires an Expo account):
npx eas build --profile development --platform android
```

Install the APK on your device/emulator, then start the dev server:

```bash
npx expo start --dev-client
```

---

## Project structure

```
apps/example/
├── app/
│   ├── _layout.tsx          # Root layout — CanopyProvider wraps all screens
│   └── index.tsx            # Home screen — all SDK features in one view
├── src/
│   └── hooks/
│       └── useMobileWallet.ts  # MWA connect/disconnect via useCanopyTransact
├── .env.example             # Environment variable template
├── app.json                 # Expo config (Android only, scheme: canopy-example)
├── babel.config.js          # babel-preset-expo
├── index.js                 # Entry point — polyfills then expo-router/entry
├── metro.config.js          # Monorepo Metro config (watchFolders + nodeModulesPaths)
├── package.json
├── tsconfig.json
└── README.md
```

---

## SDK integration patterns

### Mounting the provider

```tsx
// app/_layout.tsx
import { CanopyProvider } from "@canopy/react-native";

<CanopyProvider config={{ apiKey: "cny_…", appId: "app_…", appVersion: "1.0.0" }}>
  <YourApp />
</CanopyProvider>
```

### Connecting a wallet

```tsx
// Uses useCanopyTransact() — analytics events fire automatically
import { useCanopyTransact, useCanopy } from "@canopy/react-native";

const canopyTransact = useCanopyTransact();
const { identify } = useCanopy();

await canopyTransact(async (wallet) => {
  const auth = await wallet.authorize({ cluster: "mainnet-beta", identity: { … } });
  const address = toBase58(auth.accounts[0].address); // convert Uint8Array → string
  await identify(address); // hashes address on-device; never sends plaintext
});
```

### Tracking custom events

```tsx
import { useCanopy } from "@canopy/react-native";

const { track } = useCanopy();

track("swap_initiated", { fromToken: "SOL", toToken: "USDC", amountLamports: 500000 });
```

### Reading a remote config flag

```tsx
import { useRemoteConfig } from "@canopy/react-native";

// Returns false until the SDK fetches the server-side value.
// The cached value is returned synchronously on subsequent renders.
const showNewUI = useRemoteConfig<boolean>("feature_new_swap_ui", false);
```

---

## Troubleshooting

**`crypto.getRandomValues() not supported`**
Ensure `react-native-get-random-values` is imported at the very top of `index.js`,
before any other import.

**`The package 'solana-mobile-wallet-adapter-protocol' doesn't seem to be linked`**
You must use a custom development build, not Expo Go.
Run `npx eas build --profile development --platform android`.

**`Metro has encountered an error: While trying to resolve module @canopy/react-native`**
The Metro monorepo config in `metro.config.js` must be present.
Run `pnpm install` from the monorepo root to link workspace packages.

**`failed to connect to dev server`**
Try `npx expo start --dev-client --tunnel` for certain Wi-Fi environments.
