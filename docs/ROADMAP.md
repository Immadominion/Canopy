# Product Roadmap

**Project:** Canopy (working name)
**Document version:** 1.0
**Status:** Draft

> This roadmap is ordered by dependency and logical build sequence, not by calendar dates.
> Timelines are intentionally omitted — shipping quality work is the constraint.

---

## Guiding Principles

1. **Build in layers.** Each phase must be independently useful before the next begins.
2. **Guardrails before features.** Every beta distribution feature is blocked on all 5 safety invariants being active.
3. **SDK last.** The SDK is only useful once publishers have something to test against. Infrastructure and dashboard come first.
4. **Validate on real hardware.** Seeker integration points (Genesis Token, MWA) must be tested on physical device, not emulator.

---

## Phase 1: Foundation

> Goal: A verified publisher can upload an APK, define a tester list, and distribute a time-limited beta build to wallet-allowlisted testers.

### Infrastructure

- [x] Monorepo scaffold (Turborepo, workspaces, shared tsconfig, ESLint, Prettier)
- [x] Supabase project creation, TimescaleDB extension enabled
- [x] Supabase migrations system (ordered SQL files, CI-run migration check)
- [x] Cloudflare R2 bucket creation and configuration (private, lifecycle rules)
- [x] Vercel project creation, environment variable structure
- [x] Cloudflare Workers project scaffold (Hono, Wrangler)

### Publisher Auth

- [x] SIWS nonce generation endpoint (`GET /api/auth/nonce`)
- [x] SIWS signature verification endpoint (`POST /api/auth/verify`)
- [x] Supabase Auth integration (custom JWT, httpOnly cookie session)
- [x] Publisher verification against dApp Store Portal API
- [x] On-chain fallback verification (App NFT ownership check)
- [x] Publisher record creation and `kyc_verified` status tracking
- [x] Auth middleware for all protected API routes
- [x] Sign-in page (wallet connect, SIWS flow)
- [x] Session management (refresh, invalidate, timeout)

### App Management

- [x] `apps` table and CRUD endpoints
- [x] Create app form (package name, display name)
- [x] App list view in dashboard

### Beta Track Core

- [x] `beta_tracks` table with all fields including `tester_cap <= 200` DB constraint
- [x] APK upload endpoint (multipart, stream direct to R2)
- [x] APK validation (signed APK check, package name extraction, duplicate hash check)
- [x] Async malware scan (ClamAV or Cloudflare Gateway integration)
- [x] APK fingerprint write to Arweave via Irys on successful upload
- [x] Beta track creation form (name, version, expiry, optional gates)
- [x] Tester allowlist management (add by wallet, bulk add via CSV)
- [x] Hard tester cap enforcement (DB constraint + API-level validation + UI indicator)
- [x] Track activation (status → active, locks expiry)
- [x] Track expiry enforcement (cron job: mark expired, delete R2 object within 1h)

### Tester Install Flow

- [x] Tester landing page (`/install/{track_id}`)
- [x] Wallet connect on tester landing page (SIWS, no publisher check required)
- [x] Allowlist gate check (wallet on list, track active, not expired)
- [x] On-chain gate checks (Seeker Genesis Token, NFT collection, token balance)
- [x] Signed URL generation (15-min, HMAC-SHA256, wallet-bound)
- [x] Install event logging
- [x] R2 signed URL delivery (APK download)

### Dashboard Shell

- [x] Navigation structure (apps, beta, analytics, crashes, settings)
- [x] Loading and error states
- [x] Basic beta track list and detail view
- [x] Tester list with install status
- [x] Track expiry countdown display

### Observability

- [x] Structured logging (Pino) across all services
- [x] Error tracking (Sentry) in dashboard and ingest service
- [x] Basic uptime monitoring

---

## Phase 2: Analytics Core

> Goal: A publisher can integrate the SDK and see wallet-keyed analytics events in their dashboard, segmented by on-chain context.

### Analytics SDK

- [x] `@canopy/react-native` package scaffold
- [x] `CanopyProvider` context component
- [x] Persistent event queue (AsyncStorage)
- [x] Automatic batch flush (interval, threshold, backgrounding)
- [x] MWA lifecycle auto-capture:
  - [x] `mwa_session_start`
  - [x] `mwa_session_end`
  - [x] `mwa_transaction_signed`
  - [x] `mwa_transaction_declined`
  - [x] `mwa_wallet_connected`
  - [x] `mwa_wallet_disconnected`
- [x] App lifecycle auto-capture (`app_open`, `app_foreground`, `app_background`)
- [x] `Canopy.track(event, properties)` manual tracking API
- [x] Wallet hash (SHA-256) computed client-side before transmission
- [x] On-chain enrichment: Seeker Genesis Token, SKR balance tier, NFT holdings (batched, cached)
- [x] SDK identity resolution (anonymous → identified when wallet connected)
- [x] 5-line integration guide and README

### Ingest Service

- [x] Cloudflare Workers + Hono setup
- [x] `POST /v1/events` endpoint (batch)
- [x] API key validation (Cloudflare KV with TTL)
- [x] Per-key rate limiting (Durable Objects)
- [x] Event deduplication (client UUID, KV store, 24h TTL)
- [x] Supabase write via Cloudflare Hyperdrive (connection pooling)
- [x] `POST /v1/crashes` endpoint

### Analytics Tables & Queries

- [x] `analytics_events` TimescaleDB hypertable
- [x] Continuous aggregates for common query patterns (DAU, event counts by day)
- [x] Analytics query API endpoints (events, sessions, cohorts)
- [x] Supabase RLS for analytics tables

### Analytics Dashboard

- [x] Event timeline chart (events per day/hour)
- [x] Top events table
- [x] Daily/weekly/monthly active wallets
- [x] MWA funnel visualisation (connect → sign → transact)
- [x] Wallet cohort filter: Seeker Genesis Token holders vs non-holders
- [x] Wallet cohort filter: SKR balance tiers
- [x] Wallet cohort filter: NFT collection holders
- [x] Session details view
- [x] Event properties explorer

---

## Phase 3: Release Ops & Crash Reporting

> Goal: Publishers can integrate Canopy into their CI/CD pipeline and receive crash reports with wallet context.

### Crash Reporting

- [x] `crash_reports` table
- [x] Crash ingest endpoint (`POST /v1/crashes`) with deduplication by fingerprint
- [x] Crash reporter in SDK (uncaught exception handler, last-event breadcrumbs)
- [x] Wallet context capture at crash time (holdings, session state)
- [x] Crash issues list view (grouped by fingerprint)
- [x] Crash issue detail (stack trace, wallet context, recent events, device info)
- [x] Status management (open, resolved)
- [x] Crash trend chart

### CLI (`@canopy/cli`)

- [x] CLI project scaffold (TypeScript, tsup build, npm publish workflow)
- [x] `canopy config` command (API key storage, default app)
- [x] `canopy beta create` command (upload APK, create track, output invite URL)
- [x] `canopy beta status` command
- [x] `canopy beta close` command
- [x] `canopy check` command (static APK analysis: signing check, permission audit)
- [x] `canopy release` command (generates dApp Store submission config YAML)

### GitHub Actions

- [x] `@canopy/action-beta-deploy` GitHub Action
- [x] `@canopy/action-release` GitHub Action
- [x] Example workflow files for docs
- [x] CI integration guide (setup, secrets, example YAML)

### Release Dashboard

- [x] `releases` table and CRUD
- [x] Release list view (version history with dApp Store submission status)
- [x] Pre-submission APK check results display
- [x] Release notes editor
- [x] dApp Store submission status polling (manual sync stub — on-chain polling pending confirmed program address)

---

## Phase 4: Platform & Collaboration

> Goal: Teams can collaborate, manage multiple apps, and run advanced analytics experiments.

### Team & Organisation

- [x] Organisation model (one org per publisher, multiple members)
- [x] Invite team members by email
- [x] Role-based access control (owner, admin, developer, viewer)
- [x] Activity log per org
- [x] Multiple API keys per org with scoped permissions

### Remote Config

- [x] `remote_configs` table (key, value, conditions)
- [x] Condition types: on-chain cohort, app version, Seeker-only, percentage rollout
- [x] Remote config SDK fetch + local cache + runtime evaluation
- [x] Config management dashboard
- [x] Config change history and rollback

### Advanced Analytics

- [x] Custom event funnels (multi-step)
- [x] Retention curves (N-day retention by cohort)
- [x] A/B test assignment via remote config + analytics correlation
- [x] Custom on-chain cohort builder (define cohort by holding criteria)
- [x] Data export (CSV)
- [x] Webhook delivery (event stream to developer-controlled endpoint)

### Billing

- [x] Stripe integration (subscription management)
- [x] Free / Pro / Scale tier enforcement
- [x] Usage metering (events per month, beta testers used, crash reports)
- [x] Billing portal
- [x] Upgrade prompts at tier limits

### Developer Experience

- [x] SDK documentation site (`apps/docs` — Fumadocs, dark-mode Nothing Design theme)
- [x] API reference documentation (OpenAPI 3.1 spec + Scalar interactive explorer at `/api/reference`)
- [x] Integration guides (GitHub Actions, Expo, bare React Native MDX docs)
- [x] Example apps (complete sample app with Canopy integrated)
- [x] Changelog (`CHANGELOG.md` at monorepo root)

---

## Invariants That Apply to Every Phase

These are hard rules that must not be bypassed regardless of development stage, sprint pressure, or convenience:

1. **Publisher Identity Gate** — Only wallets with verified publisher status can create beta tracks. Unverified wallets see an onboarding prompt, not a creation form.
2. **Hard Tester Cap** — The `tester_cap <= 200` check exists at three levels: DB constraint, API validation, UI counter. All three must remain active.
3. **Mandatory Build Expiry** — No beta track can be created or activated without an expiry. Maximum 30 days. No renewal of the same build.
4. **Allowlist-Only Distribution** — No public beta links. Every tester must be explicitly added by wallet address by the publisher.
5. **No Public Discoverability** — Beta track URLs are not indexed, not linkable from public pages, and not guessable by ID alone (UUIDs are private).
