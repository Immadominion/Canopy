# Canopy

### Developer infrastructure for Solana Mobile apps

> **Working name.** Final branding TBD — see [Name Candidates](#name-candidates).

Canopy is a developer operations platform purpose-built for the Solana Mobile ecosystem. It closes the gap between writing code and shipping to real Seeker users — without bypassing the dApp Store.

---

## The Problem in One Paragraph

The Solana dApp Store has a 3–5 business day review queue per submission, no staged rollout, no TestFlight equivalent, and no analytics layer that understands on-chain identity. Firebase solves analytics for web2. Nothing solves it for Solana Mobile, where a user *is* a wallet address, *is* a Seeker Genesis Token holder, *is* a SKR balance. Canopy is that missing layer.

---

## What Canopy Is

| Pillar | What It Does | Why It's Different |
|---|---|---|
| **Beta Tracks** | Distribute pre-release APKs to wallet-allowlisted testers before dApp Store submission | Gated by on-chain identity (not email), auto-expiring, private by design |
| **Web3 Analytics** | Track user behavior tied to wallet address, NFT holdings, MWA sessions, on-chain activity | Wallet identity — not anonymous device IDs |
| **Release Ops** | CI/CD integration → beta track → dApp Store submission in one pipeline | Built around the `dapp-store` CLI and publisher portal API |

---

## What Canopy Is Not

- **Not a shadow app store.** You cannot distribute apps permanently or publicly through Canopy. Beta tracks have hard tester caps (200) and hard time limits (max 30 days). Every track is private and wallet-allowlisted.
- **Not a Firebase clone.** Firebase has no concept of wallet identity, Seeker device state, MWA session analytics, or on-chain cohort segmentation.
- **Not a way to skip dApp Store review.** Using Canopy requires a verified dApp Store publisher account (KYC/KYB complete). Beta tracks are for testing *before* you submit — not instead of submitting.

---

## Documentation Index

| Document | Purpose |
|---|---|
| [Business Requirements](docs/BUSINESS_REQUIREMENTS.md) | Problem definition, goals, stakeholders, success metrics, constraints |
| [Functional Requirements](docs/FUNCTIONAL_REQUIREMENTS.md) | User stories, feature specs, use cases by module |
| [Non-Functional Requirements](docs/NON_FUNCTIONAL_REQUIREMENTS.md) | Performance, security, scalability, availability, compliance |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flows, database schema, API shape, infrastructure |
| [Roadmap](docs/ROADMAP.md) | Product phases and feature backlog (no dates) |
| [Whitepaper](docs/WHITEPAPER.md) | Technical and conceptual overview for a broader audience |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Developer Dashboard (Next.js 16, App Router)            │
│  Sign-in with Solana (SIWS) + Publisher Portal verify    │
└────────────────────┬────────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   API Layer         │   ← Next.js API Routes + Hono ingest
          │   (Auth, Tracks,    │
          │    Releases, Ops)   │
          └──────┬──────┬───────┘
                 │      │
    ┌────────────▼─┐  ┌─▼───────────────┐
    │  Supabase    │  │  Cloudflare R2   │
    │  Postgres    │  │  (APK binaries,  │
    │  Auth        │  │   signed URLs)   │
    │  Storage     │  └─────────────────┘
    └──────────────┘
          │
    ┌─────▼──────────────────┐
    │  Arweave (via Irys)    │   ← Immutable audit trail, pays in SOL
    │  Publisher reg records │
    │  Beta release hashes   │
    └────────────────────────┘

    ┌──────────────────────────────────────────┐
    │  React Native SDK (@canopy/react-native)  │
    │  Installed in developer's app             │
    │  → MWA session hooks, event emission,    │
    │    crash reporting, wallet-linked identity│
    └──────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Dashboard | Next.js 16 App Router, TypeScript | SSR + React Server Components for performance |
| Styling | Tailwind CSS + shadcn/ui | Consistent, accessible, fast to ship |
| Auth | Sign-in with Solana (SIWS) | Wallet-native auth, no password layer |
| Database | Supabase (PostgreSQL + TimescaleDB) | Relational data + time-series analytics in one |
| APK Storage | Cloudflare R2 | No egress fees, CDN delivery, S3-compatible |
| Immutable Records | Arweave via Irys | Pays in SOL, permanent storage, ecosystem-aligned |
| Analytics Ingest | Hono on Cloudflare Workers | High-throughput, low-latency event ingestion |
| SDK | React Native, TypeScript | Matches the dominant Solana Mobile dev stack |
| On-chain | Solana (@solana/kit v6, Anchor) | Publisher verification, Seeker Genesis Token check |
| CI/CD Integration | GitHub Actions (YAML workflows) | Standard developer toolchain |

---

## Grey Area Prevention — The 5 Guardrails

The hardest engineering problem here is not building the product; it's making sure the product can't be weaponised as a shadow distribution channel.

1. **Publisher Identity Gate** — Only wallets registered as KYC/KYB-verified publishers on the Solana dApp Store portal can create beta tracks. Verified at auth time.
2. **Hard Tester Cap** — Maximum 200 testers per beta track. Not configurable above this limit at any tier.
3. **Mandatory Build Expiry** — All beta APKs expire. Default: 14 days. Maximum: 30 days. No renewals on the same build.
4. **Allowlist-Only Install** — No public install links. Every tester is added by wallet address and must sign an install authorization. The signed URL is tied to their wallet and non-transferable.
5. **No Public Discoverability** — Beta tracks have no listing, no search index, no public URL. They are invisible to anyone not on the allowlist.

Together: the math makes shadow distribution impossible (200 testers × 30 days × private = a testing tool, not a distribution channel).

---

## Name Candidates

The working name "Canopy" is a placeholder. Final branding decision pending.

| Name | Rationale |
|---|---|
| **Canopy** | Protective layer above the ecosystem; growth metaphor |
| **Seedkit** | Ties to Seed Vault (Seeker's hardware key custody); "kit" = developer tool |
| **Runway** | Where apps prepare before launch |
| **Preflight** | Pre-submission checklist; clear testing metaphor |

---

## Status

**v0.6.0 — Active development.** All platform pillars are implemented. Monorepo contains production-grade code across all packages. See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## Repository Structure

```
canopy/
├── apps/
│   ├── web/              # Next.js 16 App Router dashboard
│   ├── ingest/           # Hono on Cloudflare Workers — analytics ingest
│   ├── docs/             # Fumadocs documentation site
│   └── example/          # Example React Native app
├── packages/
│   ├── sdk/              # @canopy/react-native SDK
│   ├── cli/              # @canopy/cli for CI/CD and dApp Store tooling
│   ├── types/            # @canopy/types — shared TypeScript types
│   ├── utils/            # @canopy/utils — shared utilities
│   ├── action-beta-deploy/  # GitHub Action: deploy beta track
│   └── action-release/      # GitHub Action: trigger release
├── supabase/
│   ├── migrations/       # Ordered SQL migration files
│   └── functions/        # Supabase Edge Functions
├── docs/                 # Product and architecture documentation
└── .github/
    ├── copilot-instructions.md
    └── workflows/        # GitHub Actions CI/CD
```
