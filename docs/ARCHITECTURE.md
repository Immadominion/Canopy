# Architecture Document

**Project:** Canopy (working name)
**Document version:** 1.1
**Status:** Draft — under active revision

---

## 0. Pinned Dependency Versions

Before adding any package, verify the latest stable release on GitHub. The following are the confirmed minimum versions as of the last review. Always use the latest within these ranges.

| Package | Version | Notes |
|---|---|---|
| `next` | `^16.2.6` | App Router — latest includes critical security patches |
| `turbo` | `^2.9.14` | Monorepo build orchestration |
| `hono` | `^4.12.21` | CF Workers ingest — security fixes included |
| `@solana/kit` | `^6.9.0` | **v2 Solana SDK** by anza-xyz. Import from `@solana/kit`. NOT `@solana/web3.js`. |
| `@supabase/supabase-js` | `^2.106.1` | Supabase JS client |
| `@solana-mobile/mobile-wallet-adapter-protocol` | `^2.x` | MWA for React Native |
| `typescript` | `^5.8.x` | Strict mode required |
| `pnpm` | `10.33.1` | Pinned exactly in `packageManager` field |
| Node.js | `>=24.0.0` | Required in `engines` field of every `package.json` |

> **Rule:** Never use `@solana/web3.js`. The v2 API was published under a new package name: `@solana/kit`. All on-chain code imports from `@solana/kit` or its sub-packages (`@solana/addresses`, `@solana/transactions`, `@solana/keys`, etc.).

---

## 1. System Overview

Canopy is a multi-component SaaS platform. The components are:

| Component | Description | Location |
|---|---|---|
| **Dashboard** | Next.js 16 web app — the publisher-facing UI | `apps/web` |
| **API** | Next.js API routes — auth, beta tracks, account management | `apps/web/app/api` |
| **Ingest Service** | Hono on Cloudflare Workers — high-throughput analytics event ingestion | `apps/ingest` |
| **React Native SDK** | `@canopy/react-native` — installed in developers' apps | `packages/sdk` |
| **CLI** | `@canopy/cli` — CI/CD and pre-submission tooling | `packages/cli` |
| **Supabase** | Postgres (OLTP + time-series) + Auth + Storage | Hosted |
| **Cloudflare R2** | APK binary storage with CDN delivery | Hosted |
| **Arweave (via Irys)** | Immutable audit records | Decentralised |
| **Solana** | Publisher verification, on-chain identity checks | Mainnet |

---

## 2. Architecture Diagram

```
╔══════════════════════════════════════════════════════════════════╗
║  DEVELOPER'S APP (Seeker / Android)                              ║
║  ┌─────────────────────────────────────────────────────────┐     ║
║  │  @canopy/react-native SDK                               │     ║
║  │  - MWA session hooks                                    │     ║
║  │  - Event queue (AsyncStorage)                           │     ║
║  │  - Crash reporter                                       │     ║
║  └────────────────────┬────────────────────────────────────┘     ║
╚═══════════════════════╪══════════════════════════════════════════╝
                        │ HTTPS (batched events)
                        ▼
╔══════════════════════════════════════════════════════════════════╗
║  INGEST SERVICE (Cloudflare Workers — Hono)                      ║
║  - Validates API key                                             ║
║  - Rate limiting per key                                         ║
║  - Event deduplication check                                     ║
║  - Batched writes to Supabase                                    ║
╚══════════════════════════════╪═══════════════════════════════════╝
                               │
            ┌──────────────────▼──────────────────┐
            │                                     │
            ▼                                     ▼
╔═══════════════════════╗         ╔═════════════════════════════╗
║  Supabase             ║         ║  Cloudflare R2              ║
║  ─────────────────    ║         ║  ──────────────────────     ║
║  PostgreSQL (OLTP)    ║         ║  APK binaries (private)     ║
║  TimescaleDB          ║         ║  Signed URL generation      ║
║  (analytics TS data)  ║         ║  Auto-delete on expiry      ║
║  Auth (JWT + SIWS)    ║         ╚═════════════════════════════╝
║  Storage (metadata)   ║
╚═══════════════════════╝
            │
            ▼
╔══════════════════════════════════════════════════════════════════╗
║  DASHBOARD (Next.js 15 — Vercel)                                 ║
║  ─────────────────────────────────────────────────────────────   ║
║  App Router + React Server Components                            ║
║  Auth: SIWS → Supabase Auth                                      ║
║  Modules: Beta Tracks, Analytics, Crash Reports, Release Ops     ║
╚══════════════════════════════╪═══════════════════════════════════╝
                               │
            ┌──────────────────▼──────────────────┐
            │                                     │
            ▼                                     ▼
╔═══════════════════════╗         ╔═════════════════════════════╗
║  Solana RPC           ║         ║  Arweave (via Irys)         ║
║  ─────────────────    ║         ║  ──────────────────────     ║
║  Publisher wallet     ║         ║  Publisher reg hashes       ║
║  verification         ║         ║  Beta release fingerprints  ║
║  Seeker Genesis Token ║         ║  Install auth logs          ║
║  NFT / token checks   ║         ║  (pays in SOL)              ║
╚═══════════════════════╝         ╚═════════════════════════════╝

            ▲
            │
╔═══════════╧═════════════════════════════════════════════════════╗
║  @canopy/cli (GitHub Actions / local terminal)                   ║
║  - Beta track creation from CI                                   ║
║  - Pre-submission APK checks                                     ║
║  - dApp Store submission pipeline                                ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 3. Component Deep-Dives

### 3.1 Dashboard (`apps/web`)

**Framework:** Next.js 15, App Router, TypeScript  
**Hosting:** Vercel  
**Auth:** SIWS + Supabase Auth

**Directory structure:**

```
apps/web/
├── app/
│   ├── (auth)/              # Sign-in pages
│   ├── (dashboard)/         # Protected dashboard routes
│   │   ├── apps/            # App management
│   │   ├── beta/            # Beta track management
│   │   ├── analytics/       # Analytics views
│   │   ├── crashes/         # Crash reports
│   │   └── settings/        # Account & org settings
│   └── api/
│       ├── auth/            # SIWS nonce, verify, session
│       ├── apps/            # App CRUD
│       ├── beta/            # Beta track endpoints
│       ├── analytics/       # Analytics query endpoints
│       └── webhooks/        # Incoming webhooks (CI/CD)
├── components/
│   ├── ui/                  # shadcn/ui base components
│   ├── charts/              # Analytics charts (Recharts)
│   └── shared/              # Shared layout components
└── lib/
    ├── supabase/            # Supabase client (server + client)
    ├── solana/              # SIWS, wallet utils, on-chain checks
    └── r2/                  # R2 signed URL generation
```

**Authentication Flow:**

```
1. User clicks "Connect Wallet"
2. Frontend calls GET /api/auth/nonce → receives {nonce, expiresAt}
3. Frontend requests wallet to sign SIWS message (nonce embedded)
4. Frontend calls POST /api/auth/verify with {wallet, signature, message}
5. Server verifies signature against message and nonce
6. Server calls publisher verification (Portal API or on-chain fallback)
7. Server creates/updates user record in Supabase
8. Server issues JWT (stored in httpOnly cookie)
9. User is redirected to dashboard
```

### 3.2 Ingest Service (`apps/ingest`)

**Framework:** Hono  
**Runtime:** Cloudflare Workers  
**Purpose:** Receive analytics events from the SDK at high throughput

This service is intentionally simple and stateless. It does not have a database of its own. All persistent state lives in Supabase.

**Endpoints:**

- `POST /v1/events` — Receive a batch of analytics events
- `POST /v1/crashes` — Receive a crash report
- `GET /health` — Health check

**Event processing pipeline:**

```
SDK batch → Worker receives → Validate API key (KV lookup) →
Rate check (Durable Object counter) → Dedup check (event UUID) →
Write to Supabase (pg.js connection pooling via Hyperdrive) →
Return 200
```

**Why Cloudflare Workers:**

- Globally distributed — low latency from Seeker devices anywhere
- Scales to 0 when idle (no cost during dev/testing)
- No egress fees within Cloudflare network (R2, KV, Hyperdrive all in-network)
- Stateless by design — no accidental shared state between requests

### 3.3 React Native SDK (`packages/sdk`)

**Language:** TypeScript  
**Target:** React Native 0.73+, Expo SDK 51+  
**Key dependencies:** `@solana-mobile/mobile-wallet-adapter-protocol`, `@react-native-async-storage/async-storage`

**Architecture pattern:** Context provider wraps app root. Internal event queue uses AsyncStorage for persistence. MWA lifecycle hooks auto-capture. Custom events via `Canopy.track()`.

**SDK Modules:**

```
packages/sdk/src/
├── CanopyProvider.tsx      # Root context provider
├── core/
│   ├── queue.ts            # Persistent event queue
│   ├── flush.ts            # Batch flush to ingest service
│   └── identity.ts         # Wallet identity + on-chain enrichment
├── auto/
│   ├── mwa.ts              # MWA lifecycle auto-capture
│   └── session.ts          # App session tracking
├── manual/
│   └── track.ts            # Canopy.track() API
├── crashes/
│   └── reporter.ts         # Crash reporting
└── config/
    └── remote.ts           # Remote config fetch + cache
```

**Privacy-by-design decisions:**

- Wallet addresses are SHA-256 hashed before leaving the device by default
- On-chain enrichment is batched and cached; no per-request RPC calls in the hot path
- SDK never reads or logs private keys or seed phrases
- No network requests made until `CanopyProvider` is mounted (opt-in)

### 3.4 CLI (`packages/cli`)

**Language:** TypeScript (compiled to Node.js)  
**Distribution:** npm (`@canopy/cli`)

**Commands:**

```
canopy beta create    — Upload APK, create beta track
canopy beta status    — Check status of a beta track
canopy beta close     — Manually close a beta track
canopy check          — Pre-submission static analysis of APK
canopy release        — Submit to dApp Store via portal API
canopy config         — Manage local CLI config (API key, defaults)
```

---

## 4. Database Schema

> All tables use UUIDs as primary keys. `created_at` and `updated_at` are on all tables.

### Core Tables

```sql
-- Publishers (one per verified dApp Store publisher wallet)
CREATE TABLE publishers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL UNIQUE,   -- base58 Solana address
  wallet_hash     TEXT NOT NULL UNIQUE,   -- SHA-256 of wallet_address
  portal_account_id TEXT,                 -- dApp Store publisher portal ID (if known)
  kyc_verified    BOOLEAN NOT NULL DEFAULT false,
  kyc_verified_at TIMESTAMPTZ,
  plan            TEXT NOT NULL DEFAULT 'free',  -- free | pro | scale
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apps (one per Android package name, per publisher)
CREATE TABLE apps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id    UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  package_name    TEXT NOT NULL,           -- e.g. com.example.myapp
  display_name    TEXT NOT NULL,
  dapp_store_app_nft TEXT,                -- On-chain App NFT address (if minted)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(publisher_id, package_name)
);

-- Beta Tracks
CREATE TABLE beta_tracks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  version_name    TEXT NOT NULL,
  apk_hash        TEXT NOT NULL,           -- SHA-256 of the APK
  apk_r2_key      TEXT NOT NULL,           -- R2 object key (internal)
  apk_size_bytes  BIGINT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | active | closed | expired
  tester_cap      INT NOT NULL DEFAULT 200 CHECK (tester_cap <= 200),
  expires_at      TIMESTAMPTZ NOT NULL,
  nft_gate_collection TEXT,               -- Optional: required NFT collection address
  token_gate_mint TEXT,                   -- Optional: required SPL token mint
  token_gate_min  NUMERIC,                -- Optional: minimum token balance
  seeker_only     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tester Allowlist
CREATE TABLE beta_testers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id        UUID NOT NULL REFERENCES beta_tracks(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,
  wallet_hash     TEXT NOT NULL,
  added_by        UUID NOT NULL REFERENCES publishers(id),
  installed_at    TIMESTAMPTZ,
  install_count   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, wallet_hash)
);

-- Install Events
CREATE TABLE install_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id        UUID NOT NULL REFERENCES beta_tracks(id),
  tester_id       UUID NOT NULL REFERENCES beta_testers(id),
  wallet_hash     TEXT NOT NULL,
  device_model    TEXT,
  android_version TEXT,
  is_seeker       BOOLEAN,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Analytics Tables

```sql
-- Analytics Events (TimescaleDB hypertable, partitioned by time)
CREATE TABLE analytics_events (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps(id),
  event_name      TEXT NOT NULL,
  wallet_hash     TEXT,                   -- SHA-256 hashed wallet address
  session_id      TEXT,
  properties      JSONB,
  sdk_version     TEXT,
  app_version     TEXT,
  platform        TEXT,                   -- android
  is_seeker       BOOLEAN,
  has_genesis_token BOOLEAN,
  skr_balance_tier TEXT,                  -- none | low | medium | high
  timestamp       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, timestamp)             -- Required for TimescaleDB
);

-- Convert to hypertable
SELECT create_hypertable('analytics_events', 'timestamp', chunk_time_interval => INTERVAL '1 day');

-- Crash Reports
CREATE TABLE crash_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps(id),
  fingerprint     TEXT NOT NULL,          -- Hash of normalised stack trace
  error_message   TEXT,
  stack_trace     TEXT,
  wallet_hash     TEXT,
  app_version     TEXT,
  sdk_version     TEXT,
  device_model    TEXT,
  android_version TEXT,
  last_events     JSONB,                  -- Last 5 analytics events before crash
  wallet_context  JSONB,                  -- On-chain context at crash time
  status          TEXT NOT NULL DEFAULT 'open',
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Auth & Organisation Tables

```sql
-- Organisation Members
CREATE TABLE org_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id    UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'developer',  -- owner | admin | developer | viewer
  invited_by      UUID REFERENCES auth.users(id),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(publisher_id, user_id)
);

-- API Keys
CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id    UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,   -- bcrypt hash
  key_prefix      TEXT NOT NULL,          -- First 8 chars, stored plaintext
  scope           TEXT NOT NULL DEFAULT 'full',  -- read | beta_write | full
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);
```

### Row-Level Security Policies

All tables have RLS enabled. Key policies:

```sql
-- Publishers can only see their own data
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY apps_publisher_only ON apps
  FOR ALL USING (publisher_id IN (
    SELECT publisher_id FROM org_members WHERE user_id = auth.uid()
  ));

-- Analytics events are readable by the app's publisher org
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_publisher_only ON analytics_events
  FOR SELECT USING (app_id IN (
    SELECT id FROM apps WHERE publisher_id IN (
      SELECT publisher_id FROM org_members WHERE user_id = auth.uid()
    )
  ));
```

---

## 5. Data Flows

### Flow 1: Publisher Onboarding

```
Browser → "Connect Wallet" click
→ GET /api/auth/nonce  (returns {nonce, expiresAt})
→ Wallet signs SIWS message
→ POST /api/auth/verify {wallet, signature, message}
  → Server: verify signature (ed25519)
  → Server: check nonce validity and expiry
  → Server: call dApp Store Portal API to verify publisher KYC
    → If API unavailable: check on-chain for App NFT owned by wallet
    → If no App NFT: mark as unverified, show onboarding screen
  → Server: upsert publisher record in Supabase
  → Server: write publisher registration to Arweave via Irys (hashed wallet only)
  → Server: issue JWT (httpOnly cookie, 24h)
→ Redirect to dashboard
```

### Flow 2: Beta Track Creation (via Dashboard)

```
Developer uploads APK file
→ POST /api/beta/upload (multipart)
  → Server: validate APK (signed, valid package name, not duplicate hash)
  → Server: scan APK for malware (async, track held in 'draft' until complete)
  → Server: upload APK to R2 (private bucket, key = {publisher_id}/{track_id}/{hash}.apk)
  → Server: create beta_tracks record (status: 'draft')
  → Server: write APK hash + track metadata to Arweave (fingerprint record)
Developer adds testers by wallet address
→ POST /api/beta/{track_id}/testers {wallets: [...]}
  → Validate: track exists and belongs to publisher
  → Validate: total testers would not exceed 200
  → Upsert beta_testers records
Developer activates track
→ PATCH /api/beta/{track_id} {status: 'active'}
  → Validate: malware scan complete
  → Set expires_at = now() + configured duration
```

### Flow 3: Tester Install

```
Tester receives install link: https://app.canopy.dev/install/{track_id}?invite={invite_token}
→ Tester visits URL in browser
→ "Connect Wallet" prompt
→ Tester connects wallet (SIWS, same flow as publisher but no publisher check)
→ POST /api/beta/install/initiate {track_id, wallet, signature}
  → Validate: track is active and not expired
  → Validate: wallet is on allowlist
  → Validate: on-chain gates (if configured):
    → Check Seeker Genesis Token holding
    → Check NFT collection holding
    → Check token balance
  → Generate time-limited (15min) signed R2 download URL
    → URL payload: {track_id, wallet_hash, issued_at, expires_at, nonce}
    → HMAC-SHA256 signed with R2 signing secret
  → Log install_event (wallet_hash, timestamp, track_id, device context)
→ Signed URL returned to browser
→ Browser initiates APK download
→ Tester installs APK via Android installer
```

### Flow 4: Analytics Event Ingestion

```
App (SDK) → local event queue (AsyncStorage)
→ Flush trigger (30s interval OR 50 events OR app backgrounding)
→ POST https://ingest.canopy.dev/v1/events
  Body: {
    api_key: "cny_...",
    app_id: "...",
    events: [{
      id: "client-generated-uuid",
      name: "mwa_transaction_signed",
      wallet_hash: "sha256...",
      properties: {...},
      timestamp: 1716000000000
    }]
  }
→ Worker: validate API key (Cloudflare KV lookup, TTL 60s)
→ Worker: rate limit check (Durable Object)
→ Worker: dedup check (event IDs stored in KV for 24h)
→ Worker: write batch to Supabase via Hyperdrive (connection pool)
→ Worker: return 200 {accepted: N, rejected: M}
SDK: clear flushed events from queue
```

---

## 6. On-Chain Architecture

### Publisher Verification

The primary verification path is via the dApp Store Publisher Portal API. The fallback, if the API is unavailable or does not expose a public endpoint, is on-chain verification.

**On-chain fallback:**
The dApp Store creates App NFTs on Solana when a developer publishes an app. These NFTs are owned by the publisher's wallet. Canopy can verify publisher status by checking: "does this wallet own any App NFTs from the Solana Mobile dApp Store program?"

The App NFT program address and schema are not publicly documented as of the time of writing. This verification path requires research during implementation.

### Seeker Genesis Token Check

The Seeker Genesis Token is an NFT on Solana. Canopy checks holding status by querying the token accounts for a given wallet address against the known Genesis Token collection.

```typescript
// Pseudocode
async function hasGenesisToken(walletAddress: string): Promise<boolean> {
  const accounts = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(walletAddress),
    { programId: TOKEN_PROGRAM_ID }
  );
  return accounts.value.some(
    (acc) => acc.account.data.parsed.info.mint === GENESIS_TOKEN_MINT
  );
}
```

### Arweave Records (via Irys)

Irys is the recommended gateway for Arweave uploads that pay in SOL. It provides:

- Instant, provable upload confirmation
- SOL payment (no need to hold AR tokens)
- Permanent storage on Arweave

Records uploaded to Arweave are minimal and contain only hashed identifiers:

```json
{
  "type": "canopy_publisher_registration",
  "publisher_wallet_hash": "sha256:abc123...",
  "timestamp": 1716000000,
  "canopy_version": "1.0"
}
```

These records are the immutable audit trail that makes the system tamper-proof. If a bad actor claims they never used Canopy, the Arweave record proves otherwise.

---

## 7. Infrastructure

### Environments

| Environment | Purpose | URL Pattern |
|---|---|---|
| Local | Development | `localhost:3000` |
| Preview | Per-PR Vercel preview | `canopy-git-{branch}.vercel.app` |
| Staging | Pre-production | `staging.canopy.dev` |
| Production | Live | `app.canopy.dev` |

### Services & Hosting

| Service | Provider | Notes |
|---|---|---|
| Dashboard | Vercel | Free/Pro plan; ISR for public pages |
| Ingest Worker | Cloudflare Workers | Paid plan for production |
| KV Store (API key cache) | Cloudflare KV | In-network with Workers |
| Database | Supabase | Pro plan; TimescaleDB extension enabled |
| File Storage | Cloudflare R2 | Private bucket; no egress fees |
| Arweave Gateway | Irys | Pay-per-upload in SOL |
| Solana RPC | Helius | Reliable RPC with enhanced APIs |
| Email | Resend | Transactional email |
| Monitoring | Better Stack or Grafana Cloud | Logs + uptime |

### Cloudflare R2 Bucket Configuration

```
Bucket: canopy-apks
Access: Private (no public access)
CORS: None (all access via signed URLs only)
Lifecycle rules:
  - Delete objects with tag 'expired:true' after 1 hour
  - Delete objects not accessed in 31 days (safety net)
```

---

## 8. API Design

### Conventions

- Base URL: `https://app.canopy.dev/api/v1`
- All requests: JSON body, `Content-Type: application/json`
- Authentication: `Authorization: Bearer {jwt}` (dashboard) or `Authorization: Bearer {api_key}` (CLI/CI)
- Error format: `{ "error": { "code": "TRACK_NOT_FOUND", "message": "...", "details": {} } }`
- Pagination: cursor-based, `?cursor={id}&limit={n}`

### Key Endpoints

```
Auth
POST   /auth/nonce           Get SIWS nonce
POST   /auth/verify          Verify SIWS signature, issue session
DELETE /auth/session         Sign out

Apps
GET    /apps                 List apps for authenticated publisher
POST   /apps                 Create app
GET    /apps/:id             Get app details
PATCH  /apps/:id             Update app

Beta Tracks
GET    /apps/:id/tracks      List beta tracks
POST   /apps/:id/tracks      Create beta track
GET    /tracks/:id           Get track details
PATCH  /tracks/:id           Update track (status, expiry, etc.)
POST   /tracks/:id/testers   Add testers to allowlist
DELETE /tracks/:id/testers/:wallet  Remove tester
GET    /tracks/:id/testers   List testers and install status
POST   /tracks/:id/upload    Upload APK (multipart)

Install Flow (public, wallet-authenticated)
GET    /install/:track_id    Get track info (for tester landing page)
POST   /install/initiate     Begin install: wallet auth → signed URL

Analytics
GET    /analytics/events     Query events (date range, filters, groupby)
GET    /analytics/sessions   Session-level aggregates
GET    /analytics/cohorts    Cohort definitions and metrics

Crash Reports
GET    /crashes              List crash issues
GET    /crashes/:id          Crash issue detail with events
PATCH  /crashes/:id          Update status

API Keys
GET    /api-keys             List keys
POST   /api-keys             Create key
DELETE /api-keys/:id         Revoke key
```

---

## 9. Security Architecture

### Defence-in-Depth Layers

```
Layer 1: Cloudflare WAF (DDOS, rate limiting, bot detection)
Layer 2: SIWS signature verification (cryptographic identity)
Layer 3: Publisher verification (dApp Store KYC status check)
Layer 4: Supabase RLS (row-level access control enforced at DB layer)
Layer 5: Application RBAC (role checks in API route handlers)
Layer 6: Signed URLs (APK access time-bound and wallet-bound)
Layer 7: Arweave audit trail (immutable evidence of all key actions)
```

### Secret Management

- All secrets in environment variables, never in code
- Secrets validated at startup via Zod schema
- Production secrets in Vercel environment variables (encrypted at rest)
- Cloudflare Workers secrets via `wrangler secret put`
- No secrets in git history (pre-commit hook + CI check)

---

## 10. Monorepo Structure

```
canopy/
├── apps/
│   ├── web/                    # Next.js 15 dashboard + API
│   └── ingest/                 # Hono Cloudflare Worker
├── packages/
│   ├── sdk/                    # @canopy/react-native
│   ├── cli/                    # @canopy/cli
│   ├── types/                  # @canopy/types (shared TypeScript types)
│   └── utils/                  # @canopy/utils (shared utilities)
├── supabase/
│   ├── migrations/             # Ordered SQL migration files
│   ├── seed.sql                # Development seed data
│   └── functions/              # Supabase Edge Functions
├── docs/                       # This documentation
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
│       ├── ci.yml              # PR checks
│       ├── preview.yml         # Preview deploy
│       └── deploy.yml          # Production deploy
├── turbo.json                  # Turborepo config
├── package.json                # Workspace root
└── tsconfig.base.json          # Shared TypeScript config
```
