# Changelog

All notable changes to Canopy are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Planned

- On-chain dApp Store submission status polling (pending confirmed program address)

---

## [0.6.0] — A/B Experiments + On-Chain Cohort Builder

### Added

#### A/B test assignment via remote config + analytics correlation

- `supabase/migrations/0014_ab_experiments_cohorts.sql` — three new tables: `experiments`, `experiment_variants`, `cohort_definitions`; RLS policies on all three; `trigger_set_updated_at` triggers
- `GET/POST /api/v1/analytics/experiments` — list and create experiments with variants; validates app ownership and optional `remote_config_id` linkage
- `GET/PATCH/DELETE /api/v1/analytics/experiments/[experimentId]` — fetch, update status (`draft` → `active` → `concluded`), delete draft experiments; auto-stamps `started_at` / `concluded_at` on status transitions
- `GET /api/v1/analytics/experiments/[experimentId]/results` — variant-level event count and unique wallet metrics, filtered by experiment window
- Deterministic FNV-1a variant assignment in remote-config response — same wallet always receives the same variant; no `experiment_assignments` table needed
- `_experiments` field added to remote-config `GET` response — SDK tags subsequent analytics events with `ab_experiment_id` + `ab_variant_id` in event properties
- Dashboard: `apps/web/src/app/dashboard/apps/[appId]/analytics/experiments/page.tsx` — experiment list with status badges, traffic percentage, variant weight breakdown
- Dashboard: `apps/web/src/app/dashboard/apps/[appId]/analytics/experiments/[experimentId]/page.tsx` — variant results comparison (total events + unique wallets per variant, leading variant highlighted)
- Client components: `ExperimentListClient`, `ExperimentResultsClient` (Nothing Design, OLED-black, Space Mono labels)

#### Custom on-chain cohort builder

- `apps/web/src/lib/cohort/evaluator.ts` — server-side cohort evaluator using Helius DAS `getAssetsByOwner` API; paginates up to 10 pages; evaluates `seeker_only`, `has_genesis_token`, `skr_balance_tier`, and `nft_collection` conditions with `and`/`or` logic
- `GET/POST /api/v1/analytics/cohorts` — list and create cohort definitions with Zod-validated criteria (discriminated union per condition type)
- `GET/PATCH/DELETE /api/v1/analytics/cohorts/[cohortId]` — standard CRUD
- `POST /api/v1/analytics/cohorts/[cohortId]/evaluate` — server-side wallet membership check; wallet address never stored
- `on_chain_cohort` remote-config condition now fully implemented — `nft_collection` evaluated against `nftCollections` query param (comma-separated collection mints sent by SDK); `min_skr_tier` multi-condition logic fixed
- `nftCollections` query parameter added to remote-config `GET` endpoint — SDK passes held collection mints (evaluated on-device via Helius DAS)
- Dashboard: `apps/web/src/app/dashboard/apps/[appId]/analytics/cohorts/page.tsx` — cohort list with condition pills and inline evaluate panel
- Client component: `CohortBuilderClient` — full condition builder UI with type dropdown, `and`/`or` combinator, SKR tier selector, NFT collection mint + min-count fields

#### Shared type additions (`packages/types`)

- `ExperimentStatus`, `Experiment`, `ExperimentVariant`, `ExperimentAssignment` types
- `CohortConditionType`, `CohortCondition` (discriminated union), `CohortCriteria`, `CohortDefinition`, `SkrBalanceTier` types
- All types exported from `@canopy/types`

---

## [0.5.0] — Example App

### Added

#### `apps/example` — Reference Expo app

- Complete example Expo 52 / React Native 0.76 app at `apps/example/` demonstrating all four SDK features
- `app/_layout.tsx` — `<CanopyProvider>` mounted at root with EXPO_PUBLIC env vars
- `app/index.tsx` — Single screen showing wallet connect, custom event tracking, and remote config
- `src/hooks/useMobileWallet.ts` — MWA connect/disconnect via `useCanopyTransact()`; auto-emits wallet analytics events
- Polyfill entry point (`index.js`) loading `react-native-get-random-values` and `buffer` before Expo Router
- Monorepo Metro config (`metro.config.js`) with `watchFolders` + `nodeModulesPaths` for workspace package resolution
- `.env.example` template with `EXPO_PUBLIC_CANOPY_API_KEY`, `EXPO_PUBLIC_CANOPY_APP_ID`, optional `EXPO_PUBLIC_CANOPY_INGEST_URL`
- `README.md` with quick-start guide, integration patterns, and troubleshooting section
- ROADMAP: marked `[ ] Example apps` as complete — Phase 4 Developer Experience fully shipped

---

## [0.4.0] — Developer Experience + Advanced Analytics

### Added

#### `apps/docs` — Documentation site (Fumadocs)

- Full documentation site at `apps/docs` powered by Fumadocs 16.9.1 and Next.js 16
- Nothing Design System theme: OLED black background, Space Grotesk body, Space Mono labels, accent red `#D71921`
- Dark-mode-only, CSS token overrides for Fumadocs components
- Interactive API explorer at `/api/reference` powered by Scalar (`@scalar/nextjs-api-reference@0.10.14`)
- OpenAPI 3.1.0 spec covering all `/api/v1/` routes (`apps/docs/public/openapi.yaml`)

#### MDX documentation pages

- `index.mdx` — Platform overview with three-pillar summary table
- `getting-started.mdx` — 5-step SDK integration guide (install → CanopyProvider → identify → track → verify)
- `sdk-reference.mdx` — Full `@canopy/react-native` API reference (CanopyProvider, useCanopy, identify, track, screen, flush, reset, withCanopy HOC, TypeScript types)
- `expo.mdx` — Expo SDK 51+ integration guide
- `bare-react-native.mdx` — Bare RN 0.73+ integration guide with ProGuard rules
- `github-actions.mdx` — CI/CD integration guide with full workflow YAML, pre-submission checks table, and environment variable reference
- `api-reference.mdx` — HTTP API reference with full endpoint documentation

#### Phase 4 Advanced Analytics

- NFT cohort analytics: `analytics_nft_daily` TimescaleDB continuous aggregate (migration 0013)
- NFT cohort API route (`GET /api/v1/analytics/[appId]/nft-cohort`) and dashboard section
- Session details API (`GET /api/v1/analytics/[appId]/sessions/[sessionId]`) and full event timeline view
- Event properties explorer API (`GET /api/v1/analytics/[appId]/event-properties`) and dashboard property browser

#### Phase 3 Release Ops

- dApp Store submission status endpoint (`GET /api/v1/releases/[releaseId]/submission-status`)
- Manual status sync endpoint (`POST /api/v1/releases/[releaseId]/submission-status`) for portal-confirmed state transitions
- `PortalStatusSection` dashboard component — inline status selector for `submitted`/`in_review` releases, links to Publisher Portal
- `TODO` marker for future on-chain polling when dApp Store program address is confirmed

---

## [0.3.0] — Platform & Collaboration (Phase 4)

### Added

#### Team & Organisation

- Organisation model: one org per publisher, multi-member support
- Invite flow: email-based invitations, role assignment on accept
- RBAC: `owner`, `admin`, `developer`, `viewer` roles with route-level enforcement
- Organisation activity log: all publisher and API key actions recorded
- Multiple API keys per org with scoped permissions (`releases:read`, `releases:write`, `tracks:read`, `tracks:write`, `analytics:read`, `api-keys:read`)
- API key management dashboard (create, view, revoke)

#### Billing

- Stripe subscription integration (`stripe@22.1.1`, API version `2026-04-22.dahlia`)
- Free / Pro / Scale tier enforcement via `PLAN_LIMITS` map
- Usage metering: events/month, beta testers, crash reports
- Billing portal page with current usage gauges and Stripe Customer Portal link
- Upgrade prompts at plan limits throughout the dashboard

#### Remote Config

- `remote_configs` table with `conditions` JSONB (on-chain cohort, app version, Seeker-only, percentage rollout)
- Remote config management dashboard (create, edit, rollback)
- Config change history with timestamp and author

#### Advanced Analytics

- Custom event funnels (multi-step, configurable event sequence)
- N-day retention curves (cohort-based, 1–30 day window)
- CSV data export for all analytics views
- Webhook delivery: configurable HTTP endpoint, HMAC-SHA256 signed payloads, retry with exponential backoff

---

## [0.2.0] — Analytics Core (Phase 2)

### Added

#### `@canopy/react-native` SDK

- `CanopyProvider` context with lazy network initialisation
- Persistent event queue via AsyncStorage (survives app kill mid-flush)
- Batch flush: 30-second interval, 50-event threshold, AppState backgrounding
- Auto-captured MWA lifecycle events: `mwa_session_start/end`, `mwa_transaction_signed/declined`, `mwa_wallet_connected/disconnected`
- Auto-captured app lifecycle: `app_open`, `app_foreground`, `app_background`
- `Canopy.track(event, properties)` manual API
- `Canopy.identify(walletAddress)` — SHA-256 hashes wallet client-side before any network call
- On-chain enrichment: Seeker Genesis Token, SKR balance tier, NFT holdings (batched, 5-min TTL cache)
- Identity resolution: anonymous → identified on wallet connect

#### Ingest Service (`apps/ingest`)

- Cloudflare Workers + Hono 4.x
- `POST /v1/events` batch endpoint with per-key rate limiting (Durable Objects)
- `POST /v1/crashes` crash ingest with deduplication by fingerprint
- API key validation via Cloudflare KV (TTL-cached)
- Event deduplication: client UUID, 24h KV TTL
- Supabase write via Cloudflare Hyperdrive (connection pooling)

#### Analytics Tables & Dashboard

- `analytics_events` TimescaleDB hypertable (migration 0004)
- Continuous aggregates: DAU, WAU, MAU, event counts by day (migration 0005)
- Event timeline chart (D/W/M toggle)
- Top events table with sparklines
- Active wallet metrics (DAU/WAU/MAU)
- MWA funnel visualisation (connect → sign → transact)
- Wallet cohort filters: Seeker Genesis Token holders, SKR balance tiers

---

## [0.1.0] — Foundation (Phase 1)

### Added

#### Infrastructure

- Turborepo monorepo with `apps/web`, `apps/ingest`, `packages/sdk`, `packages/cli`, `packages/types`, `packages/utils`
- Supabase PostgreSQL + TimescaleDB (migration 0001 baseline)
- Cloudflare R2 private bucket with lifecycle rules for expired APK deletion
- Vercel deployment for `apps/web`, Cloudflare Workers for `apps/ingest`
- pnpm@10.33.1 workspace configuration

#### Publisher Auth

- Sign-in with Solana (SIWS): nonce generation, signature verification, JWT session
- Publisher verification against dApp Store Portal API with on-chain App NFT fallback
- `publishers` table with `kyc_verified` flag, protected by RLS
- SIWS nonce table: single-use, 5-minute TTL

#### Beta Track Distribution

- `beta_tracks` table with `CHECK (tester_cap <= 200)` DB constraint
- APK upload: multipart stream to R2, SHA-256 fingerprint, duplicate hash check
- APK validation: signature check, package name extraction
- Async malware scan (ClamAV integration) — required before track activation
- APK fingerprint immutable record on Arweave via Irys
- Tester allowlist: add by wallet address, bulk CSV import
- Three-layer cap enforcement: DB constraint + API HTTP 409 + UI counter
- Track activation, expiry enforcement (cron: mark expired, delete R2 object ≤1h)
- Signed download URLs: HMAC-SHA256, 15-min validity, wallet-bound (URL for wallet A fails for wallet B)
- Tester landing page with on-chain gate checks (Genesis Token, NFT collection, token balance)

#### Crash Reporting (Phase 3 infra)

- `crash_reports` table with fingerprint deduplication
- Crash issue list and detail views (stack trace, wallet context, device info)
- Crash trend chart

#### Release Pipeline

- `releases` table: full status state machine (`draft` → `check_passed` → `submitted` → `published`)
- Pre-submission APK check results display
- Release notes editor
- dApp Store submission config YAML generation via CLI

#### Dashboard Shell

- Nothing Design System applied throughout: OLED black, Space Grotesk, Space Mono, accent red
- Navigation: apps, beta tracks, analytics, crashes, releases, settings
- App list, beta track list/detail, tester list with install status
- Track expiry countdown

#### Security baseline

- RLS enabled on every table
- Wallet addresses stored as SHA-256 hashes in analytics and tester tables
- API keys: bcrypt-hashed, plaintext returned once only
- Zod validation on all API inputs
- R2 bucket private — access only via signed URLs

---

[Unreleased]: https://github.com/canopy-devops/canopy/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/canopy-devops/canopy/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/canopy-devops/canopy/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/canopy-devops/canopy/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/canopy-devops/canopy/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/canopy-devops/canopy/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/canopy-devops/canopy/releases/tag/v0.1.0
