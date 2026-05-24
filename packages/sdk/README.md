# @canopy/react-native

Canopy SDK for Solana Mobile / Seeker — wallet-keyed analytics, crash reporting, and MWA lifecycle tracking.

## 5-line integration

```tsx
// 1. Install
// pnpm add @canopy/react-native

// 2. Wrap your app root
import { CanopyProvider } from "@canopy/react-native";

export default function App() {
  return (
    <CanopyProvider config={{ apiKey: "cny_...", appId: "app_..." }}>
      <YourApp />
    </CanopyProvider>
  );
}

// 3. Identify the connected wallet (wallet address is SHA-256 hashed on device)
const { identify } = useCanopy();
await identify(walletPublicKey.toBase58());

// 4. Track custom events
const { track } = useCanopy();
track("swap_initiated", { dex: "jupiter", amount_lamports: 1_000_000 });

// 5. Wrap MWA transact() for automatic wallet session analytics
const canopyTransact = useCanopyTransact();
await canopyTransact(async (wallet) => {
  // your MWA transaction logic
});
```

## Requirements

- React Native `>=0.73`
- Expo SDK `>=51` (if using Expo)
- `@solana-mobile/mobile-wallet-adapter-protocol` `^2.x`
- Node.js `>=24` (build tooling)

## Installation

```bash
pnpm add @canopy/react-native
```

Get your `apiKey` and `appId` from the [Canopy Dashboard](https://canopy.build).

---

## API reference

### `<CanopyProvider>`

Mount once at the root of your component tree, **outside** navigation.

```tsx
<CanopyProvider
  config={{
    apiKey: "cny_...",        // Required. Your Canopy API key.
    appId: "app_...",         // Required. Your app's Canopy ID.
    ingestUrl: "https://...", // Optional. Custom ingest endpoint.
    debug: false,             // Optional. Log SDK internals (dev only).
  }}
>
  <App />
</CanopyProvider>
```

SDK invariants enforced here:

- **No network requests before mount.** No client is initialised at module load time.
- **Never crashes the host app.** All SDK-internal errors are caught and silently discarded.
- **Auto-flush** on: 30-second interval, 50-event threshold, or `AppState` backgrounding.
- **Wallet addresses are hashed on device** (SHA-256) before any event leaves the device.

---

### `useCanopy()`

```tsx
const {
  track,       // Queue a custom analytics event
  identify,    // Associate a wallet address with the current session
  reset,       // Clear wallet identity (e.g. on disconnect)
  sessionId,   // The current session UUID
  walletHash,  // SHA-256 of the identified wallet, or null
} = useCanopy();
```

#### `track(eventName, properties?)`

```tsx
track("item_purchased", {
  item_id: "sword_123",
  price_lamports: 5_000_000,
});
```

Properties must be JSON-serialisable. Avoid PII. Wallet address is always captured as a hash — never pass the raw address in properties.

#### `identify(walletAddress)`

```tsx
await identify(publicKey.toBase58());
// Emits `wallet_connected` event. Hash stored in session.
```

Call `identify` after a successful MWA wallet connection. Pass the raw base58 address — the SDK hashes it before transmission.

#### `reset()`

```tsx
reset();
// Emits `wallet_disconnected` event. Clears wallet hash from session.
```

---

### `useCanopyTransact()`

A drop-in wrapper around MWA `transact()` that auto-tracks wallet session lifecycle events.

```tsx
import { useCanopyTransact } from "@canopy/react-native";

const canopyTransact = useCanopyTransact();

async function signMessage() {
  await canopyTransact(async (wallet) => {
    // identical to regular MWA transact()
    await wallet.signMessages([...]);
  });
}
```

Automatically emits:

| Event | When |
| --- | --- |
| `mwa_session_start` | `transact()` callback begins |
| `mwa_transaction_signed` | Callback resolves successfully |
| `mwa_session_error` | Callback throws |
| `mwa_session_end` | `transact()` settles (success or error) |

---

## Crash reporting

Crash events are captured automatically when your app throws an unhandled error inside `<CanopyProvider>`. No additional setup needed.

To manually report a caught error:

```tsx
const { track } = useCanopy();

try {
  await riskyOperation();
} catch (err) {
  track("crash_report", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    app_version: "1.2.0",
  });
}
```

Crash reports appear in the **Crashes** tab of your app dashboard with trend charts and occurrence counts.

---

## Event flushing

Events are queued in `AsyncStorage` and flushed to the Canopy ingest service:

| Trigger | Condition |
| --- | --- |
| Interval | Every 30 seconds while app is foregrounded |
| Threshold | Queue reaches 50 events |
| Background | `AppState` changes to `background` or `inactive` |

The queue persists across app kills. If a flush fails, events remain in the queue and are retried on the next trigger.

---

## Privacy

- **Wallet addresses are never transmitted in plaintext.** SHA-256 is applied on-device before any event is enqueued.
- **No PII is collected** by the SDK itself. Custom event properties are your responsibility.
- All event payloads are transmitted over HTTPS to the Canopy ingest service.

---

## Seeker device detection

`CanopyProvider` automatically detects whether the app is running on a Seeker device by querying for the Seeker Genesis Token in the connected wallet's token accounts. This populates the `is_seeker` flag on all events, enabling Seeker cohort analysis in the dashboard.

---

## TypeScript

Full TypeScript support. All public types are exported from the package root:

```ts
import type { CanopyConfig, CanopyEvent } from "@canopy/react-native";
```

---

## Support

- Dashboard: [canopy.build](https://canopy.build)
- Docs: [canopy.build/docs](https://canopy.build/docs)
