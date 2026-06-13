# Canopy — tester app (`@canopy/tester`)

The Canopy **tester app** is the TestFlight-equivalent for Solana Mobile. Testers
install it **once from the Solana dApp Store** (a publisher-signed, store-verified
source — the trusted root), then install wallet-allowlisted beta builds *through*
it. Each build is verified against its signed SHA-256 fingerprint before it is
handed to Android's installer, so a tampered or substituted APK is never
installed. This replaces downloading a raw `.apk` from a web page — the
deepfake/phishing vector.

```text
web /install/[trackId]  ──deeplink──▶  canopy://beta/<trackId>  (this app)
        │                                        │
        └─ if app missing ─▶ solanadappstore://details?id=app.canopy.tester
                                                 │
   SIWS (MWA) ─▶ /api/v1/auth/verify?client=mobile ─▶ session in keystore
                                                 │
   /api/v1/beta/mine ─▶ list ─▶ /api/v1/beta/install/initiate ─▶ signed URL
                                                 │
   download ─▶ verify sha256 == fingerprint ─▶ PackageInstaller (native)
```

## Status: foundation (Phase 1)

What works now (compiles + typechecks, no device needed):

- Expo Router screens: `connect` (SIWS), `index` (my betas), `beta/[trackId]`.
- On-device SIWS (`src/lib/siws.ts`) → Supabase session in `expo-secure-store`.
- API client (`src/lib/api.ts`) + Bearer-authed fetch (`src/lib/session.ts`).
- Trusted-install pipeline (`src/lib/verify.ts`): initiate → download → verify → install.
- Native installer **interface** (`src/native/installer.ts`) — JS stub for now.

## Phase 2 — native installer (written; needs an on-device build to test)

The native Expo module **`modules/canopy-installer`** (Kotlin) is implemented:
it wraps Android `PackageInstaller` (with `REQUEST_INSTALL_PACKAGES`, declared
in `app.json`) and hashes the downloaded APK natively. `src/native/installer.ts`
is wired to it; when the native side isn't compiled in (Expo Go / JS-only) it
reports `isAvailable() === false` and the install pipeline refuses to proceed
rather than installing anything unverified.

Build + test on the connected Seeker:

```sh
pnpm --filter @canopy/tester prebuild   # generates android/, autolinks the module
pnpm --filter @canopy/tester android    # installs the dev build on the device
```

Verify end-to-end: connect wallet → see betas → tap Install → the system shows
the install confirmation → app installs. The first install will prompt to allow
Canopy to "install unknown apps" (the OS handles this via the permission).

> The install only proceeds if `sha256(downloaded apk) === build fingerprint`.

## Phase 3 — publish to the Solana dApp Store (needs a publisher account)

Use `@solana-mobile/dapp-store-cli`: a publisher NFT + signing keypair + some
SOL + store listing assets, then `npx dapp-store create`/`publish`. The store
deeplink that the web launcher targets (`solanadappstore://details?id=app.canopy.tester`)
goes live once published.

## Env

Copy `.env.example` to `.env`:

```sh
EXPO_PUBLIC_CANOPY_API_URL=https://your-canopy-web-host   # LAN IP / tunnel for local dev
```
