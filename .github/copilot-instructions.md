# GitHub Copilot Instructions

These instructions apply to every AI-assisted session in this repository.
Read them completely before generating any code, suggestions, or responses.

---

## 1. Project Overview

This is **Canopy** (working name — candidates: Canopy, Seedkit, Runway, Preflight), a SaaS developer operations platform purpose-built for the Solana Mobile / Seeker ecosystem.

The three product pillars are:
1. **Beta Tracks** — Wallet-gated, time-limited APK distribution (TestFlight equivalent for Solana Mobile)
2. **Web3-Native Analytics** — Event tracking keyed to wallet addresses + on-chain context
3. **Release Ops** — CI/CD integration, crash reporting with wallet context, dApp Store submission pipeline

Read `docs/WHITEPAPER.md` for the full product vision. Read `README.md` for a quick overview.

---

## 2. Repository Structure

```
canopy/
├── apps/
│   ├── web/              # Next.js 15 App Router dashboard + API routes
│   └── ingest/           # Hono on Cloudflare Workers — analytics ingest
├── packages/
│   ├── sdk/              # @canopy/react-native — installed in developers' apps
│   ├── cli/              # @canopy/cli — CI/CD and dApp Store tooling
│   ├── types/            # @canopy/types — shared TypeScript types
│   └── utils/            # @canopy/utils — shared utilities
├── supabase/
│   ├── migrations/       # Ordered SQL migration files
│   └── functions/        # Supabase Edge Functions
├── docs/                 # All documentation — read before implementing features
└── .github/
    └── workflows/        # GitHub Actions CI/CD
```

The full monorepo uses Turborepo. Always check `turbo.json` and the workspace `package.json` before adding new packages.

---

## 3. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Dashboard | Next.js 16 (App Router, TypeScript) | Use RSC by default; client components only when necessary |
| Styling | Tailwind CSS + shadcn/ui | Do not introduce other UI libraries |
| UI Design System | Nothing Design (see `context/nothing-design-skill/`) | Apply to all dashboard UI — see Section 15 |
| Auth | Sign-in with Solana (SIWS) + Supabase Auth | No username/password auth |
| Database | Supabase PostgreSQL + TimescaleDB | All schema changes via migration files in `supabase/migrations/` |
| APK Storage | Cloudflare R2 | Private bucket only — never public |
| Immutable records | Arweave via Irys | Never use Walrus (Sui blockchain, wrong ecosystem) |
| Analytics Ingest | Hono on Cloudflare Workers | No Express, no Node.js server for ingest |
| SDK | React Native + TypeScript | Target RN 0.73+, Expo SDK 51+ |
| On-chain | `@solana/kit` (v2 API), Anchor where applicable | `@solana/kit` is the v2 SDK published by anza-xyz — NOT `@solana/web3.js` |
| Monorepo tooling | Turborepo | |
| Package manager | pnpm | |

---

## 4. Critical Invariants — Never Bypass These

These five rules are non-negotiable design invariants of the product. Any code that would weaken, bypass, or circumvent them must be rejected and rewritten.

### Invariant 1: Publisher Identity Gate
Only wallets with verified KYC/KYB status from the dApp Store Publisher Portal can create beta tracks.
- The `publishers.kyc_verified` flag must be checked before any beta track creation
- Do not add developer shortcuts, env variable overrides, or `skipKyc` flags in any environment

### Invariant 2: Hard Tester Cap (200)
No beta track may have more than 200 testers. This is enforced at three levels simultaneously:
1. Database: `CHECK (tester_cap <= 200)` constraint on `beta_tracks`
2. API: HTTP 409 if adding testers would exceed cap
3. UI: Form disabled and counter shown when at limit
- Never increase this limit. 200 is a product invariant, not a configuration option.

### Invariant 3: Mandatory Build Expiry
- All beta tracks must have an `expires_at` (max 30 days from creation)
- No nullable `expires_at` field
- No renewal of the same build (new build = new upload)
- Expired APKs must be deleted from R2 within 1 hour
- A cron job or Supabase scheduled function must enforce this

### Invariant 4: Allowlist-Only Distribution
- No public install links
- Every tester must be explicitly added by wallet address
- Signed APK download URLs must be wallet-bound (HMAC includes wallet hash)
- A signed URL for wallet A must not work for wallet B

### Invariant 5: No Public Discoverability
- Beta track detail endpoints return 404 for unauthenticated requests and for wallets not on the allowlist
- No endpoint lists or searches beta tracks publicly
- Track IDs are UUIDs — never expose sequential IDs

---

## 5. Security Requirements

Follow these in all code generation:

- **Signed URLs**: APK download URLs are signed with HMAC-SHA256. They include `{track_id, wallet_hash, issued_at, expires_at, nonce}` in the payload. Default validity: 15 minutes.
- **SIWS nonces**: Nonces expire in 5 minutes and are single-use. Store consumed nonces in Supabase with TTL.
- **API keys**: Store only bcrypt hashes. Never log plaintext API keys. Return the plaintext key only once, immediately after creation.
- **Secrets**: Use environment variables only. Validate all env vars at startup with Zod. Never hardcode secrets.
- **RLS**: Every table in Supabase must have Row-Level Security enabled. Adding a table without RLS is a blocker.
- **R2 bucket**: Must remain private. Never add public access rules or disable the private bucket setting.
- **Wallet addresses**: SHA-256 hash wallet addresses before storing in the database. Store `wallet_hash` not `wallet_address` in analytics and tester tables. The `publishers` table stores both (needed for on-chain verification), protected by RLS.
- **Malware scanning**: APKs must be scanned before their beta track is activated. Never activate a track that has not completed a malware scan.
- **Input validation**: Validate all API inputs with Zod at the route handler level before touching the database.

---

## 6. Database Conventions

- All primary keys are UUIDs (`gen_random_uuid()`)
- All tables include `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Mutable tables include `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` with a trigger
- Schema changes go in `supabase/migrations/` as sequential numbered SQL files
- Never run `ALTER TABLE` directly in production — always via migration
- `analytics_events` is a TimescaleDB hypertable — do not query it with full table scans; always include a time range filter
- Enable RLS on every new table in the same migration that creates it

---

## 7. API Conventions

- Base path: `/api/v1/`
- All responses: JSON
- Authentication: `Authorization: Bearer {jwt}` (dashboard sessions) or `Authorization: Bearer {api_key}` (CLI/CI)
- Errors: `{ "error": { "code": "SCREAMING_SNAKE_CASE", "message": "human readable", "details": {} } }`
- Pagination: cursor-based, `?cursor={id}&limit={n}`
- Versioned from day one — do not use unversioned routes

---

## 8. Solana / On-Chain Specifics

- Publisher verification: check `publishers.kyc_verified` first (fast path). If stale, re-verify against dApp Store Portal API. Fallback: check whether the wallet owns any App NFTs from the dApp Store program.
- Seeker Genesis Token: check by querying token accounts for the Genesis Token collection mint address. Store result as `is_seeker` boolean with a TTL cache.
- Use `@solana/kit` **v6.x** APIs exclusively. This is the v2 SDK published by anza-xyz. The old `@solana/web3.js` v1 patterns (`Connection`, `Transaction`, `sendAndConfirmTransaction`) are banned. The v2 alpha that shipped briefly as `@solana/web3.js@2.x` is now `@solana/kit`. Import from `@solana/kit` or its sub-packages (`@solana/addresses`, `@solana/transactions`, etc.).
- RPC provider: Helius. Use the env var `SOLANA_RPC_URL`. Do not hardcode RPC URLs.
- SOL amounts: always work in lamports internally. Convert to SOL only for display.
- MWA: use `@solana-mobile/mobile-wallet-adapter-protocol` for the React Native SDK. Current stable: `1.x`.

---

## 9. SDK Conventions (`packages/sdk`)

- Event queue persists to AsyncStorage — assume the app can be killed mid-flush
- Flush is triggered by: 30-second interval, 50-event threshold, or `AppState` backgrounding
- Wallet addresses are hashed **on the device** before any network call — the ingest service never receives a plaintext wallet address
- The SDK must not crash the host app. All SDK-internal errors must be caught and silently discarded (with optional debug logging behind a flag)
- No network requests are made until `CanopyProvider` is mounted. Do not initialise a network client at module load time.

---

## 10. Storage — Cloudflare R2

- APKs are stored at key pattern: `{publisher_id}/{track_id}/{sha256_hash}.apk`
- Never expose R2 object keys to the client directly — they are internal identifiers
- Access is always via signed URLs generated by the API
- Signed URLs are generated using the R2 signing secret from environment variables
- Lifecycle rules on the bucket handle deletion of expired APKs; the application also deletes explicitly on track expiry

---

## 11. Arweave / Irys

- Use Irys SDK for all Arweave uploads — it accepts SOL for payment
- Records are minimal JSON: only hashed identifiers (never plaintext wallet addresses or APK keys)
- Do not block user-facing operations on Arweave write confirmation — write asynchronously and store the transaction ID when confirmed
- Record types:
  - `canopy_publisher_registration` — written when a publisher is first verified
  - `canopy_beta_track_created` — written when an APK is uploaded and a track is created
  - `canopy_install_authorised` — written when a tester install is authorised

---

## 12. What Canopy Is Not

These are explicit scope boundaries. Do not build features that cross these lines:

- **Not a public app store.** No feature should make beta tracks browsable or discoverable by the general public.
- **Not a substitute for dApp Store review.** Canopy has no review process. It does not give developers a way to "publish" to end users. Beta tracks expire and are for testers only.
- **Not a payment processor.** Canopy does not handle in-app payments. The dApp Store commission is 0% by agreement; Canopy does not touch payment flows.
- **Not a general Android/mobile platform.** All features are designed specifically for Solana Mobile and the Seeker device ecosystem.

---

## 13. Documentation Reference

Before implementing a feature, read the relevant doc:

| Topic | Document |
|---|---|
| Product vision and design decisions | `docs/WHITEPAPER.md` |
| Business goals, constraints, out-of-scope | `docs/BUSINESS_REQUIREMENTS.md` |
| What the system must do (user stories + acceptance criteria) | `docs/FUNCTIONAL_REQUIREMENTS.md` |
| Performance, security, availability, privacy targets | `docs/NON_FUNCTIONAL_REQUIREMENTS.md` |
| System components, data flows, DB schema, API design | `docs/ARCHITECTURE.md` |
| Feature backlog by phase | `docs/ROADMAP.md` |

---

## 14. Inference Policy

- Do not present inferred content as established fact.
- If a technical detail is not documented in this repo (e.g. the dApp Store App NFT program address, the Seeker Genesis Token collection address), state it explicitly as "not yet confirmed — requires research during implementation" rather than guessing.
- When a file contains a TODO or open question, surface it to the user rather than fabricating an answer.

---

## 15. Pinned Package Versions

Always use the following minimum versions. Before adding any new package, fetch the GitHub releases page to confirm the latest stable release and use that version. Never use outdated versions.

| Package | Version | Notes |
|---|---|---|
| `next` | `^16.2.6` | Latest stable — includes critical security fixes |
| `turbo` | `^2.9.14` | Monorepo orchestration |
| `hono` | `^4.12.21` | CF Workers ingest — includes security fixes |
| `@solana/kit` | `^6.9.0` | v2 Solana SDK by anza-xyz — replaces @solana/web3.js |
| `@supabase/supabase-js` | `^2.106.1` | Supabase client |
| `@solana-mobile/mobile-wallet-adapter-protocol` | `^2.x` | React Native MWA |
| `typescript` | `^5.8.x` | Strict mode always |
| `pnpm` | `10.33.1` | Package manager — pin exact in packageManager field |
| Node.js | `>=24.x` | Engines field in all packages |

**Rules:**
- Use `fetch_webpage` on the GitHub releases page to confirm the latest version before every new dependency is added.
- Never pin to a version older than what's listed above.
- Always set `"engines": { "node": ">=24.0.0" }` in every `package.json`.

---

## 16. UI Design System — Nothing Design

All dashboard UI in `apps/web` uses the **Nothing Design System** exclusively.
Reference files: `context/nothing-design-skill/nothing-design/`

Key rules (read the full skill before implementing any UI):
- **Fonts:** Space Grotesk (body/UI) + Space Mono (labels/data) + Doto (hero moments only)
- **Colours:** Dark-mode-first. OLED black (`#000000`) background. Accent red (`#D71921`) is an interrupt — one per screen.
- **No shadows, no gradients in UI chrome, no skeleton screens, no toast popups**
- **Labels:** Always Space Mono, ALL CAPS, 0.06–0.1em letter-spacing, `--text-secondary`
- **Numbers/data:** Always Space Mono
- **Three-layer hierarchy only** per screen — one primary, supporting secondary, tertiary metadata
- **One pattern break per screen** — everything else is rigidly consistent
- **Dot-matrix motif** (`Doto` font + dot-grid CSS) for hero/display moments
- Never use the Nothing Design skill trigger phrase — it applies automatically to all dashboard UI in this repo

---

## 17. Zero Lint Tolerance

- **Zero ESLint errors** permitted at any time — this is a hard CI gate
- **Zero ESLint warnings** in committed code — warnings are treated as errors in CI (`--max-warnings 0`)
- **Zero TypeScript errors** — `strict: true` in all `tsconfig.json` files
- Every `package.json` must include a `"lint"` script that runs ESLint with `--max-warnings 0`
- Every `package.json` must include a `"typecheck"` script that runs `tsc --noEmit`
- Prettier formatting is enforced via `format:check` in CI — no unformatted code
- ESLint config extends `next/core-web-vitals` (web app) or `plugin:@typescript-eslint/recommended-type-checked` (all packages)
- Never add `// eslint-disable` comments unless explaining an unavoidable platform constraint
- Never add `@ts-ignore` or `@ts-expect-error` without a documented reason in the same line
