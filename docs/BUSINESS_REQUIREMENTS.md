# Business Requirements Document

**Project:** Canopy (working name)
**Document version:** 1.0
**Status:** Draft — under active revision

---

## 1. Executive Summary

The Solana Mobile dApp Store provides crypto-native developers with a distribution channel reaching 100,000+ Seeker device owners. However, the publishing infrastructure has a structural gap: there is no mechanism to test pre-release builds with real users, no analytics layer that understands on-chain identity, and no developer ops tooling that integrates the Solana-native primitives available on Seeker devices.

Canopy is a SaaS developer operations platform that fills this gap. It is not a competing app store. It is the tooling layer that sits between a developer writing code and their app being live on the dApp Store.

---

## 2. Problem Statement

### 2.1 The Testing Gap

The dApp Store review process takes 3–5 business days per submission. There is no staged rollout, no opt-in beta channel, and no mechanism to distribute a pre-release build to a controlled group of testers before committing to the formal review queue.

The practical consequence: developers either ship to production without real-user pre-testing, or they run manual, ad-hoc APK distribution via Discord/Telegram — which has no install tracking, no analytics, no expiry, and no controls. This ad-hoc approach is the exact grey area that must be addressed structurally.

### 2.2 The Analytics Gap

Existing mobile analytics platforms (Firebase Analytics, Mixpanel, Amplitude) treat every user as an anonymous device ID or email. For Solana Mobile developers, this is a fundamental mismatch. A user on a Seeker device *is* a wallet address. They may hold a Seeker Genesis Token. They have SKR balance, on-chain transaction history, and NFT holdings that directly affect how the developer should reason about their behaviour.

None of the existing analytics platforms surface this. The result: developers flying blind about the on-chain profile of their users, unable to segment by meaningful web3 cohorts, unable to correlate in-app behaviour with on-chain activity.

### 2.3 The Release Ops Gap

The existing `dapp-store` CLI enables CI/CD integration for submissions, but it is the only tooling that exists. There is no:

- Release dashboard showing submission status, version history, and review timelines
- Crash reporting with wallet context attached
- A/B testing framework
- Remote configuration gated by on-chain criteria
- Automated compliance pre-checks before submission

---

## 3. Business Objectives

| ID | Objective | Metric |
|---|---|---|
| BO-1 | Reduce the iteration cycle time for Solana Mobile developers between code change and real-user feedback | Measured by average time from beta APK upload to first install event |
| BO-2 | Provide actionable on-chain user intelligence unavailable from any existing analytics platform | Measured by developer retention and NPS |
| BO-3 | Establish Canopy as the canonical developer ops layer for the Solana Mobile ecosystem | Measured by % of active dApp Store publishers using at least one Canopy feature |
| BO-4 | Operate the beta distribution feature in a way that is structurally incapable of being misused as a shadow app distribution channel | Measured by zero policy violations traceable to Canopy beta tracks |

---

## 4. Stakeholders

| Role | Description | Primary Interest |
|---|---|---|
| **Solana Mobile Developers** | Primary users. Build Android apps targeting Seeker devices. | Faster iteration, better user data, simpler release ops |
| **Seeker Beta Testers** | End users who install pre-release builds. Wallet holders. | Access to early features, contribution to apps they care about |
| **Solana Mobile Inc.** | Operator of the dApp Store. Indirect stakeholder. | A healthier developer ecosystem; no abuse of publishing infrastructure |
| **Canopy Operator** | The company/team operating Canopy. | Sustainable SaaS revenue; ecosystem trust |

---

## 5. Business Constraints

| ID | Constraint | Source |
|---|---|---|
| BC-1 | Canopy cannot enable permanent or public APK distribution. This would constitute operating an app store without dApp Store review, violating the spirit of the Solana Mobile Developer Agreement. | Legal / Ecosystem trust |
| BC-2 | Beta tracks must require a verified dApp Store publisher identity (KYC/KYB complete via the Solana Mobile Publisher Portal). Anonymous actors cannot create beta tracks. | Policy / Grey area prevention |
| BC-3 | The analytics SDK must not collect data that would violate GDPR, CCPA, or the Solana Mobile Publisher Policy's data privacy requirements. | Legal / Compliance |
| BC-4 | Canopy is not affiliated with Solana Mobile Inc. and must not imply official endorsement or affiliation. | Legal / Branding |
| BC-5 | APK storage and distribution infrastructure must not make beta builds permanently accessible beyond their configured expiry. Storage must be configured to hard-delete after expiry. | Policy / Security |

---

## 6. Assumptions

| ID | Assumption |
|---|---|
| A-1 | The Solana Mobile Publisher Portal provides an API (or on-chain verifiable mechanism) to check whether a given wallet address corresponds to a KYC-verified publisher. If not available, an alternative verification mechanism is needed. |
| A-2 | Seeker device owners are technically comfortable installing APKs via direct download (sideloading), as the dApp Store experience already requires this familiarity. |
| A-3 | The primary developer stack for Solana Mobile is React Native. The SDK will be built for React Native first, with Kotlin and Flutter SDKs as later phases. |
| A-4 | Arweave (via Irys) is a viable and legally unencumbered storage mechanism for immutable audit records in this context. |
| A-5 | Walrus (MystenLabs) is NOT used in this architecture. Walrus is built on Sui and requires WAL tokens. It introduces a cross-chain dependency that is inappropriate for a Solana-native product. |

---

## 7. Success Metrics

| Metric | Definition |
|---|---|
| Publisher Adoption Rate | % of active dApp Store publishers with at least one active Canopy project |
| Beta Cycle Time | Median time from beta APK upload to first tester install |
| Analytics Retention | % of developers using the analytics SDK 30 days after initial integration |
| Zero Abuse Events | Number of Canopy beta tracks used to distribute apps that subsequently fail dApp Store policy review |
| SDK Integration Time | Median time from first visiting docs to first analytics event received |

---

## 8. Out of Scope (v1)

The following are explicitly out of scope for the initial product:

- **iOS / TestFlight integration** — Canopy is Android/Solana Mobile exclusive
- **App store listing management** — This is the Publisher Portal's domain
- **Token launch / NFT minting tooling** — Out of scope; separate product category
- **Multi-chain analytics** — Solana-only in v1
- **White-labelling** — Canopy is operated as a single-tenant SaaS in v1
- **Consumer-facing features** — Canopy is developer-facing only
- **Monetisation of user data** — Canopy will not resell developer or user data

---

## 9. Business Model

Canopy is a B2D (business-to-developer) SaaS. Pricing is consumption-based with a generous free tier to encourage adoption.

| Tier | Target | Included |
|---|---|---|
| **Free** | Solo developers, early-stage apps | 1 beta track, 25 testers, 30 days retention, 10k analytics events/month |
| **Pro** | Active dApp Store publishers | 5 beta tracks, 200 testers, 90 days retention, 1M analytics events/month, CI/CD integration, crash reporting |
| **Scale** | Teams with multiple apps | Unlimited tracks, priority support, advanced analytics, custom cohorts, remote config |

> Pricing tiers are directional. Final pricing requires market validation.

---

## 10. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Solana Mobile Inc. views Canopy as competitive or as enabling policy violations | High | Strict technical guardrails (tester cap, expiry, allowlist-only). Transparent public documentation of the 5 Guardrails. |
| R-2 | Publisher Portal API is not publicly accessible, blocking publisher verification | Medium | Fallback: verify publisher status via on-chain NFT (App NFT on Solana). Design verification layer as pluggable. |
| R-3 | Low developer adoption if analytics SDK integration is too heavy | Medium | SDK must be < 5 lines to integrate at minimum viable level. Zero required configuration. |
| R-4 | Regulatory uncertainty around storing wallet addresses as user identifiers | Medium | Implement wallet address hashing option. GDPR-compliant data handling. Privacy-by-design architecture. |
| R-5 | Supabase costs become prohibitive at analytics scale | Low (early) | Architecture separates OLTP (Supabase Postgres) from OLAP (time-series). Migration path to ClickHouse documented. |
