# Canopy: Developer Operations for the Solana Mobile Ecosystem

**Working title.** Final name TBD from candidates: Canopy, Seedkit, Runway, Preflight.

**Version:** 0.1 (pre-implementation)  
**Classification:** Public

---

## Abstract

The Solana Mobile dApp Store is the first on-chain, crypto-native app distribution channel that ships pre-installed on a purpose-built Android device — the Seeker. As the Solana Mobile ecosystem matures, developers building for this platform face an operational gap: there is no purpose-built tooling for testing, analytics, or release management that understands the unique properties of a Web3 app — wallet identity, on-chain asset holdings, Mobile Wallet Adapter sessions, and Seeker-specific hardware.

Canopy is a developer operations platform built to close this gap. It provides three capabilities: (1) a wallet-gated beta testing and distribution channel equivalent to Apple TestFlight but designed for Android and anchored in on-chain identity, (2) analytics instrumentation that keys user behaviour to wallet addresses and on-chain context rather than device IDs, and (3) a release operations pipeline that integrates with the dApp Store's publishing infrastructure.

This whitepaper describes the problem, the platform design, the security model that prevents misuse as a shadow distribution channel, and the technical architecture that makes wallet-keyed analytics possible.

---

## 1. Problem

### 1.1 The Testing Gap

Apple's TestFlight solves one of the hardest problems in app development: safely distributing pre-release builds to a controlled group of testers before App Store submission. The Solana Mobile dApp Store has no equivalent. A developer building a new app for the Seeker currently has no structured way to:

- Distribute an APK to a selected group of wallet holders for feedback
- Gate access by on-chain criteria (Seeker Genesis Token, NFT collection, token balance)
- Enforce time limits or tester caps to prevent leakage
- Track who installed the build and when

The existing alternative — sharing APK files over Telegram or via direct download links — is manual, ungated, and leaves no audit trail. It also creates a non-trivial security surface: sideloaded APKs from unknown sources are a vector for malware in the Android ecosystem.

### 1.2 The Analytics Gap

The dominant analytics platforms — Mixpanel, Amplitude, Firebase Analytics — are built around device identifiers: IDFA, GAID, anonymous user IDs. For a Web3 app on Solana Mobile, these identifiers miss the most important dimension: **the wallet**.

A Solana Mobile developer needs to answer questions that existing tools cannot:

- Of my MAUs, how many hold the Seeker Genesis Token?
- Does the segment of users with > 100 SKR transact more than users with < 10 SKR?
- What does the MWA connection → first transaction funnel look like?
- Do NFT holders from collection X retain better than the baseline?

None of these questions can be answered with device-ID-keyed analytics. They require wallet-keyed events with on-chain enrichment at query time.

### 1.3 The Release Operations Gap

The dApp Store provides a portal for managing submissions, but it is a manual, browser-based workflow. Developers cannot trigger a new version submission from a GitHub Actions workflow without writing custom automation against the `@solana-mobile/dapp-store-cli`. There is no crash reporting that carries wallet context. There is no single pane of glass for understanding the state of a release across testing, submission, and production.

---

## 2. Solution

Canopy is a SaaS platform with three integrated pillars.

### 2.1 Beta Tracks (Controlled APK Distribution)

A publisher creates a **beta track** by uploading a signed APK, defining a tester allowlist (by wallet address), and setting an expiry. Canopy stores the APK in a private Cloudflare R2 bucket. Testers receive a link that requires wallet authentication. After authentication, their wallet is checked against the allowlist and against any on-chain gates configured by the publisher. If all checks pass, they receive a time-limited, wallet-bound signed URL to download the APK.

This model is designed around one principle: **controlled access is not distribution**. A beta track is not a way to ship an app. It is a way to test an app with a known set of people before submitting to the dApp Store. The five design invariants that enforce this are described in Section 4.

### 2.2 Web3-Native Analytics

Publishers integrate the `@canopy/react-native` SDK into their app. The SDK:

- Auto-captures Mobile Wallet Adapter lifecycle events (connect, disconnect, transaction signed, transaction declined)
- Auto-captures app session events
- Exposes `Canopy.track()` for custom events
- SHA-256 hashes wallet addresses client-side before transmission

Events are enriched server-side with on-chain context: whether the user holds a Seeker Genesis Token, their SKR balance tier, whether they hold tokens from NFT collections the publisher cares about.

The analytics dashboard provides cohort segmentation by these on-chain dimensions — answering questions that device-ID-keyed tools fundamentally cannot.

### 2.3 Release Operations

The `@canopy/cli` package and GitHub Actions integrations allow publishers to:

- Create beta tracks from CI without touching the dashboard
- Run pre-submission static analysis on APKs (signing verification, permission audit)
- Trigger dApp Store submissions via the portal API
- Track submission status and release history in one view

---

## 3. The Solana Mobile Ecosystem

Understanding Canopy requires understanding the platform it is built on.

### 3.1 The dApp Store

The Solana Mobile dApp Store is not a traditional app store. App listings are NFTs on the Solana blockchain. Assets are stored on Arweave. Publishers complete KYC/KYB verification at the Publisher Portal (`publish.solanamobile.com`) and connect a publisher wallet. This wallet is the identity anchor for all publisher actions.

The commission rate is 0%. There are no in-app purchase restrictions beyond what is expressly prohibited by Solana Mobile's Developer Agreement.

### 3.2 Mobile Wallet Adapter

Mobile Wallet Adapter (MWA) is the open protocol by which Android apps request wallet operations from wallet apps installed on the same device. MWA sessions are initiated by the dApp, authorised by the wallet app (e.g. Phantom), and produce signed transaction authorisations. MWA is the primary user authentication and transaction layer for Solana Mobile dApps.

### 3.3 The Seeker

The Seeker is the flagship Solana Mobile Android device. It ships with the dApp Store pre-installed. Owners receive a Seeker Genesis Token — an NFT that proves device ownership and provides access to Seeker-exclusive features and rewards.

The combination of Seeker Genesis Token + Seed Vault (hardware key custody built into the Seeker) makes the Seeker the most secure consumer crypto device available, and makes its user base the highest-value segment for Solana Mobile dApp developers.

---

## 4. The Misuse Prevention Model

The hardest design problem in building Canopy is this: **a controlled APK distribution channel can become an uncontrolled one**. A product like Canopy could be used to distribute apps that bypass dApp Store review to a large number of users if the guardrails are weak.

Canopy's design addresses this with five invariants that operate at the database level, the API level, and the user interface level simultaneously. No single layer can be bypassed without bypassing all three.

### Invariant 1: Publisher Identity Gate

Only wallets that have completed KYC/KYB verification on the dApp Store Publisher Portal can create beta tracks. Canopy verifies this at account creation time and re-checks periodically. An unverified wallet sees an onboarding prompt explaining the requirement. It does not see a "Create Track" button.

**Rationale:** This ties Canopy usage to a real-world identity that Solana Mobile has already vetted. Bad actors cannot create anonymous publisher accounts.

### Invariant 2: Hard Tester Cap (200)

No beta track can have more than 200 testers. This limit is enforced at three levels:

1. Database constraint (`CHECK (tester_cap <= 200)`)
2. API validation (returns HTTP 409 if adding testers would exceed cap)
3. UI counter (shows "X / 200 testers" and disables the add form at the limit)

**Rationale:** 200 testers is sufficient for meaningful pre-release feedback and is consistent with TestFlight's free tier. It makes Canopy unsuitable as a mass distribution channel by design.

### Invariant 3: Mandatory Build Expiry

Every beta APK expires. The default is 14 days. The maximum is 30 days. Expiry cannot be disabled. The same build cannot be renewed — a new upload is required.

On expiry, Canopy:

1. Sets the track status to `expired`
2. Deletes the APK from R2 within 1 hour
3. Invalidates all outstanding signed URLs

**Rationale:** Prevents beta builds from becoming permanent parallel distribution channels.

### Invariant 4: Allowlist-Only Distribution

There are no public beta links. There is no "share with anyone who has the link" mode. Every tester must be added by wallet address by the publisher, with a hard cap of 200. Install links are wallet-bound (a link for one wallet does not work for another wallet).

**Rationale:** Eliminates viral spread of beta builds.

### Invariant 5: No Public Discoverability

Beta tracks are not indexed. They do not appear in any public list. The track URL (`/install/{track_id}`) is a UUID and returns a 404 for any wallet not on the allowlist. There is no search function for beta tracks.

**Rationale:** Prevents Canopy from becoming a shadow app store where users browse for beta apps.

---

## 5. Technical Architecture Summary

The full architecture is described in [docs/ARCHITECTURE.md](./ARCHITECTURE.md). This section provides a high-level summary for orientation.

### 5.1 Stack

| Layer | Technology | Rationale |
|---|---|---|
| Dashboard | Next.js 15, TypeScript | Server-side rendering, React Server Components |
| Analytics ingest | Hono on Cloudflare Workers | Globally distributed, scales to 0, no egress fees |
| Database | Supabase (PostgreSQL + TimescaleDB) | OLTP + time-series, hosted, RLS support |
| APK storage | Cloudflare R2 | No egress fees, private bucket, CDN |
| Immutable audit trail | Arweave via Irys | Permanent, pays in SOL, dApp Store-aligned |
| Identity | Sign-in with Solana (SIWS) | Wallet-native, no passwords |
| SDK | React Native, TypeScript | Matches dominant Solana Mobile dev stack |

### 5.2 On-Chain Identity as Differentiator

Traditional SaaS analytics platforms use anonymous IDs or device fingerprints as the primary user identifier. Both approaches have fundamental limitations for Web3:

- Anonymous IDs are lost on reinstall and across devices
- Device fingerprints cannot be correlated with on-chain state
- Neither can answer questions about token holdings, NFT ownership, or transaction history

Canopy uses the wallet address as the primary user identifier, SHA-256 hashed before leaving the device. On-chain enrichment runs asynchronously: for each unique wallet hash seen in the last 24 hours, Canopy queries Solana RPC for holding status and stores the result. Dashboard queries join event data with enrichment data at query time, enabling cohort analysis by on-chain criteria.

This is not possible with device-ID-keyed analytics. It is only possible because every meaningful user action in a Solana Mobile app is already anchored to a wallet.

### 5.3 Privacy Model

Canopy is designed to be privacy-respecting by default:

- Wallet addresses are hashed on-device before any network transmission
- Publishers access aggregated analytics, not raw wallet-to-event logs
- Individual user data is not accessible to other publishers
- RLS policies in Supabase enforce publisher isolation at the database layer
- No data is sold or shared with third parties
- Analytics data retention follows configurable policies

---

## 6. Business Model

Canopy is a SaaS product with three tiers.

| Feature | Free | Pro | Scale |
|---|---|---|---|
| Beta tracks | 1 active | 10 active | Unlimited |
| Testers per track | 200 (hard cap) | 200 (hard cap) | 200 (hard cap) |
| Analytics events / month | 50,000 | 1,000,000 | Unlimited |
| Analytics retention | 30 days | 90 days | 1 year |
| Crash reports / month | 1,000 | 50,000 | Unlimited |
| Team members | 1 | 10 | Unlimited |
| Remote config keys | — | 50 | Unlimited |
| CI/CD integrations | — | ✓ | ✓ |
| dApp Store submit pipeline | — | ✓ | ✓ |
| Priority support | — | — | ✓ |

The tester cap of 200 is **not** a tier limit. It is a system invariant. No tier can exceed it.

---

## 7. Design Decisions and Trade-offs

### Why Not Walrus for APK Storage?

Walrus is a decentralised storage protocol built on the Sui blockchain, using WAL tokens for coordination. It is not Solana-native. Using Walrus would introduce a cross-chain dependency (Sui + WAL) into a product whose entire value proposition is Solana ecosystem depth. The dApp Store itself uses Arweave — Canopy uses Arweave (via Irys, which pays in SOL) for immutable audit records and Cloudflare R2 for high-performance APK delivery.

### Why Not Firebase for Analytics?

Firebase Analytics is a strong product for traditional mobile apps. It is not designed for Web3. It cannot segment by wallet holdings, does not understand MWA sessions, and produces device-ID-keyed data that cannot be joined to on-chain state. Firebase could be used alongside Canopy for traditional metrics (crash-free rate, ANRs, Play Store distribution), but it cannot replace wallet-keyed analytics.

### Why TimescaleDB Over a Dedicated Analytics DB?

Purpose-built analytics databases (ClickHouse, Redshift, BigQuery) offer superior query performance at scale. TimescaleDB offers 90% of that benefit while staying within the Supabase/Postgres ecosystem — meaning the same connection pooling, RLS policies, and auth infrastructure used for OLTP data also applies to analytics. For an early-stage SaaS, operational simplicity outweighs marginal query performance gains.

### Why Hono on Cloudflare Workers for Ingest?

The analytics ingest service receives a high volume of small HTTP requests from mobile SDKs distributed globally. Cloudflare Workers are globally deployed, add no latency due to geographic proximity to dApp Store users (most of whom are in markets Cloudflare has PoPs in), and have no egress fees when writing to Cloudflare Hyperdrive (which connects to Supabase). A traditional Node.js server on a single-region host would add unnecessary latency and scaling complexity.

---

## 8. Open Questions

The following questions are explicitly unresolved as of this document version. They must be answered during implementation.

| Question | Impact |
|---|---|
| Does the dApp Store Publisher Portal expose a public API for publisher KYC status verification? If not, the on-chain App NFT fallback must be fully specified. | Publisher Identity Gate (Invariant 1) |
| What is the on-chain program address for dApp Store App NFTs, and how are they structured? | On-chain publisher fallback verification |
| What are the Seeker Genesis Token collection address(es)? | On-chain gate checks |
| What is the final product name? | Branding, npm package names, domain |
| Will Canopy submit to the dApp Store itself (publisher of the dashboard as a web app)? | Dogfooding opportunity |

---

## 9. Glossary

| Term | Definition |
|---|---|
| **Beta Track** | A Canopy-managed, time-limited, wallet-gated APK distribution record |
| **dApp Store** | The Solana Mobile on-chain app distribution channel, pre-installed on Seeker |
| **MWA** | Mobile Wallet Adapter — the open protocol for dApp↔wallet communication on Android |
| **Publisher** | A developer who has completed KYC/KYB verification on the dApp Store Publisher Portal |
| **Publisher Wallet** | The Solana wallet address connected during publisher KYC; the identity anchor |
| **Seeker** | The Solana Mobile flagship Android device |
| **Seeker Genesis Token** | An NFT proving Seeker device ownership |
| **SKR** | The native token of the Solana Mobile ecosystem |
| **SIWS** | Sign-in with Solana — the wallet signature-based authentication standard |
| **Seed Vault** | Seeker's hardware-level key custody system |
| **Arweave** | A permanent, decentralised storage protocol used by the dApp Store for asset storage |
| **Irys** | An Arweave gateway that accepts SOL as payment |
| **TimescaleDB** | A PostgreSQL extension that adds time-series partitioning and continuous aggregates |
| **RLS** | Row-Level Security — Supabase/PostgreSQL feature enforcing per-row access control |
| **Hono** | A lightweight web framework optimised for Cloudflare Workers |
| **Hyperdrive** | Cloudflare's connection pooler for databases, reducing connection overhead from Workers |
