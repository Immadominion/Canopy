# Functional Requirements

**Project:** Canopy (working name)
**Document version:** 1.0
**Status:** Draft — under active revision

This document describes what the system does. It is organised by module, with user stories, acceptance criteria, and edge case notes for each feature area.

---

## Module Index

1. [Publisher Authentication & Identity](#1-publisher-authentication--identity)
2. [Beta Tracks — Creation & Management](#2-beta-tracks--creation--management)
3. [Beta Tracks — Tester Experience](#3-beta-tracks--tester-experience)
4. [Analytics — SDK](#4-analytics--sdk)
5. [Analytics — Dashboard](#5-analytics--dashboard)
6. [Crash Reporting](#6-crash-reporting)
7. [Release Ops — CI/CD Integration](#7-release-ops--cicd-integration)
8. [Release Ops — Dashboard](#8-release-ops--dashboard)
9. [Remote Configuration](#9-remote-configuration)
10. [Publisher Portal & Account Management](#10-publisher-portal--account-management)

---

## 1. Publisher Authentication & Identity

### Overview

All access to Canopy is gated by a verified Solana Mobile publisher identity. Authentication is wallet-native using Sign-in with Solana (SIWS). Publisher verification confirms the authenticated wallet corresponds to a KYC/KYB-verified account on the Solana dApp Store Publisher Portal.

### User Stories

**FR-1.1** As a developer, I want to sign in with my Solana wallet so that I don't need to manage a separate username/password.

*Acceptance Criteria:*

- Dashboard presents a "Connect Wallet" button compatible with Phantom, Solflare, Backpack, and any MWA-compatible browser extension wallet
- SIWS flow generates a nonce, requests a wallet signature, and verifies the signature server-side
- A valid session JWT is issued on successful verification
- Session expires after 24 hours of inactivity; refresh requires re-signing

**FR-1.2** As a developer, I want Canopy to verify my dApp Store publisher status automatically so that I don't have to manually prove I'm a legitimate publisher.

*Acceptance Criteria:*

- On first sign-in with a new wallet, Canopy attempts to verify publisher status via the dApp Store Publisher Portal API (or on-chain NFT fallback)
- Verified publishers proceed to the dashboard
- Unverified wallets see a clear explanation: "Your wallet is not registered as a verified publisher on the Solana dApp Store. Complete KYC/KYB at publish.solanamobile.com, then return here."
- Verification status is cached for 24 hours; re-checked on each login

**FR-1.3** As a developer, I want to connect multiple wallets to one Canopy account so that I can use both a hot wallet for day-to-day use and my publisher keypair for release operations.

*Acceptance Criteria:*

- Account supports up to 5 connected wallets
- One wallet is designated the "primary" publisher wallet (the one verified against the dApp Store portal)
- Additional wallets can be used for login but not for release operations unless they are also the verified publisher wallet

**FR-1.4** As a developer, I want to invite team members to my Canopy organisation so that my team can collaborate without sharing wallets.

*Acceptance Criteria:*

- Publisher can invite by wallet address or email
- Roles: `owner`, `admin`, `developer`, `viewer`
- `viewer` can see analytics and beta track status only
- `developer` can manage beta tracks and upload APKs
- `admin` can manage all settings except billing and org deletion
- Invitations expire after 7 days if not accepted

### Edge Cases

- If publisher portal API is unavailable, fall back to on-chain App NFT ownership check
- If wallet signs with wrong network (devnet vs mainnet), reject and display clear error
- If publisher KYC is revoked on the dApp Store portal, Canopy access is suspended on next login

---

## 2. Beta Tracks — Creation & Management

### Overview

A beta track is a scoped, private, time-limited distribution channel for a pre-release APK. It is the core TestFlight-equivalent feature.

### User Stories

**FR-2.1** As a developer, I want to create a beta track for my app so that I can distribute a pre-release APK to selected testers before submitting to the dApp Store.

*Acceptance Criteria:*

- Developer selects or creates an app (identified by Android package name, e.g. `com.example.myapp`)
- Track name, description (internal), APK file/URL provided
- APK is validated: must be a valid signed Android APK; package name must match the app record
- APK is scanned for malware before track is activated
- Track expiry is set (default 14 days, max 30 days)
- Track is created in `draft` state; activated on first tester addition

**FR-2.2** As a developer, I want to upload an APK from a file or remote URL so that I can integrate beta track creation into my existing CI/CD pipeline.

*Acceptance Criteria:*

- File upload: multipart form, max 500MB
- URL upload: fetches APK from provided URL (must be HTTPS; HTTP rejected)
- Duplicate detection: if the same APK hash is uploaded to the same app, warn the developer
- Upload progress indicator in the dashboard

**FR-2.3** As a developer, I want to enforce a hard tester cap of 200 per track so that I can be confident the track cannot be used for broad distribution.

*Acceptance Criteria:*

- Tester count is hard-capped at 200 per track at every tier
- Attempts to add testers beyond 200 return a clear error
- The cap is NOT a per-tier limit — it is a system-level invariant

**FR-2.4** As a developer, I want to add testers by wallet address so that only specific on-chain identities can install the beta.

*Acceptance Criteria:*

- Input: one or more Solana wallet addresses (base58)
- Invalid addresses are rejected before submission
- Testers receive no notification by default (developer must share the install link separately)
- Optional: send in-app notification if tester has previously connected their wallet to Canopy
- Tester list is visible to `developer` role and above; hidden from `viewer`

**FR-2.5** As a developer, I want to optionally require testers to hold a specific NFT or minimum SKR balance so that I can gate my beta to a specific on-chain cohort.

*Acceptance Criteria:*

- Optional gate: tester wallet must hold NFT from specified collection address
- Optional gate: tester wallet must hold minimum SOL or SPL token balance
- Seeker Genesis Token is available as a one-click gate option
- Gates are checked at install time, not at invitation time
- Failure message shown to tester if gate conditions not met

**FR-2.6** As a developer, I want to close a beta track early so that I can stop distribution before the expiry date if needed.

*Acceptance Criteria:*

- Closing a track immediately invalidates all outstanding install links
- Tester data (installs, sessions) is retained for 90 days after close
- Closed tracks cannot be re-opened (new track must be created)

**FR-2.7** As a developer, I want to receive a notification when a beta track is 3 days from expiry so that I have time to create a new track or submit to the dApp Store.

*Acceptance Criteria:*

- Email and in-dashboard notification 3 days before expiry
- In-dashboard banner on the track page when < 3 days remain
- On expiry, track closes automatically; installs are no longer possible

### Edge Cases

- APK APK signature key must match the publisher wallet's registered release key (or be a debug variant explicitly flagged as such)
- If the APK scan fails or is inconclusive, the track is held in `pending_review` state and the developer is notified
- If the APK package name doesn't match an existing app record, developer is prompted to create the app record first

---

## 3. Beta Tracks — Tester Experience

### Overview

Testers receive a private, wallet-authenticated install flow. The experience must be low-friction while maintaining security.

### User Stories

**FR-3.1** As a tester, I want to receive and use an install link so that I can install the beta APK on my Seeker device.

*Acceptance Criteria:*

- Developer shares a unique track invite URL with testers (the URL itself does not contain the APK; it initiates the auth flow)
- Tester visits URL in a Seeker-compatible browser
- Tester connects their wallet (must be on the allowlist)
- On-chain gate checks run (if configured): Seeker Genesis Token, NFT, token balance
- If all checks pass, a time-limited (15 minutes) signed download URL is issued for the APK
- Tester downloads and installs the APK
- Install event is logged (wallet address, timestamp, track ID, device info if available)

**FR-3.2** As a tester, I want clear feedback if I'm not eligible to install so that I understand why I'm blocked.

*Acceptance Criteria:*

- Not on allowlist: "Your wallet address has not been added to this beta by the developer."
- Seeker Genesis Token gate failed: "This beta requires a Seeker Genesis Token in your wallet."
- NFT gate failed: "This beta requires holding [NFT Collection Name]."
- Track expired: "This beta track is no longer active."
- Track full (tester cap reached): N/A — cap applies to allowlist, not installs

**FR-3.3** As a tester, I want the install link to not be shareable to unapproved wallets so that I don't inadvertently distribute the APK to others.

*Acceptance Criteria:*

- The signed download URL is single-use per tester per session (invalidated after first use or after 15 minutes)
- URL is not a direct link to the APK; it is an ephemeral redirect tied to the authenticated wallet session
- If a different wallet accesses an install link originally issued to wallet A, access is denied

---

## 4. Analytics — SDK

### Overview

The Canopy React Native SDK is a lightweight package that developers install in their app. It emits wallet-linked analytics events to Canopy's ingest service, without requiring any user account or email.

### User Stories

**FR-4.1** As a developer, I want to integrate the Canopy SDK in 5 lines of code so that the barrier to adding analytics is minimal.

*Acceptance Criteria:*

- Minimum viable integration:

  ```typescript
  import { CanopyProvider } from '@canopy/react-native';

  // Wrap app root
  <CanopyProvider apiKey="YOUR_API_KEY">
    <App />
  </CanopyProvider>
  ```

- This alone enables: session tracking, MWA connection events, device/OS info (anonymised)

**FR-4.2** As a developer, I want the SDK to automatically capture MWA session events so that I get wallet connection analytics without manual instrumentation.

*Acceptance Criteria:*

- Auto-captured events: `mwa_session_started`, `mwa_session_ended`, `mwa_transaction_signed`, `mwa_transaction_rejected`, `mwa_auth_granted`, `mwa_auth_revoked`
- Each event includes: timestamp, wallet address (hashed by default; opt-in plain), transaction count in session
- Auto-capture is opt-out, not opt-in

**FR-4.3** As a developer, I want to emit custom events with properties so that I can track app-specific user actions.

*Acceptance Criteria:*

- `Canopy.track('event_name', { key: value })` API
- Event names: string, max 64 chars
- Properties: flat key-value map, max 20 keys, values must be string/number/boolean
- Events are queued locally and sent in batches (every 30 seconds, or when batch reaches 50 events)
- Queue persists across app restarts (AsyncStorage)

**FR-4.4** As a developer, I want the SDK to identify the active wallet and enrich events with on-chain context so that my analytics have real user intelligence.

*Acceptance Criteria:*

- On MWA session start, SDK reads wallet address from MWA session
- SDK fetches and caches (1 hour TTL): Seeker Genesis Token holding status, SKR balance tier (bucketed: none/low/medium/high — not exact balance for privacy), NFT collection memberships (configurable)
- This context is attached to all subsequent events until session end
- Enrichment is async and non-blocking; events emit before enrichment completes if needed

**FR-4.5** As a developer, I want to control what data the SDK collects so that I can comply with my own privacy policy.

*Acceptance Criteria:*

- `walletAddressMode`: `'hash'` (default) | `'plain'` | `'none'`
- `onChainEnrichment`: `true` (default) | `false`
- `autoCaptureMWA`: `true` (default) | `false`
- `crashReporting`: `true` (default) | `false`
- All settings documented with privacy implications

---

## 5. Analytics — Dashboard

### Overview

The dashboard is where publishers visualise the data collected by the SDK. The key differentiator is that all segmentation can be done by on-chain identity attributes.

### User Stories

**FR-5.1** As a developer, I want to see my app's active users over time so that I can track growth.

*Acceptance Criteria:*

- Time-series chart: Daily/Weekly/Monthly Active Wallets (DAW/WAW/MAW)
- Filterable by: date range, version, platform, Seeker vs non-Seeker
- Table of top events by volume

**FR-5.2** As a developer, I want to segment my users by on-chain cohorts so that I can understand which wallet types use my app.

*Acceptance Criteria:*

- Pre-built cohorts: Seeker Genesis Token holders, SKR balance tiers, verified dApp Store publishers (for developer-tools apps)
- Custom cohort builder: "wallets that hold NFT from collection X AND have at least Y SOL"
- Cohort comparison: side-by-side metrics for up to 3 cohorts

**FR-5.3** As a developer, I want to see my MWA session funnel so that I can identify where users drop off during the wallet connection flow.

*Acceptance Criteria:*

- Funnel: Session Started → Auth Granted → First Transaction → Subsequent Transactions
- Drop-off % at each step
- Breakdown by wallet app (Phantom, Solflare, etc.)

**FR-5.4** As a developer, I want to see the conversion rate for token-gated features so that I can understand how many users meet the on-chain requirements for my premium features.

*Acceptance Criteria:*

- For each custom event I instrument near a gate, show: impressions (reached gate) vs conversions (passed gate)
- Overlay: "of users who failed the gate, X% hold no qualifying NFTs; Y% hold the NFT but in a different wallet"

**FR-5.5** As a developer, I want to export my analytics data so that I can use it in external tools.

*Acceptance Criteria:*

- Export to CSV: any chart or table
- Export to JSON: full event stream for a configurable date range (max 90 days)
- Webhook: push events to a developer-provided endpoint in real time (Pro tier)

---

## 6. Crash Reporting

### User Stories

**FR-6.1** As a developer, I want to receive crash reports with wallet context attached so that I can understand what the user's state was when the app crashed.

*Acceptance Criteria:*

- Crash report includes: stack trace, JS error, native crash info (if available), device OS version, app version
- Wallet context (if a session was active): wallet address (hashed), last 5 events before crash, MWA session duration
- On-chain context (if enrichment was complete): Seeker Genesis Token status, SKR balance tier
- Crash reports grouped by issue fingerprint (same stack trace → same issue)

**FR-6.2** As a developer, I want to mark crashes as resolved so that I can track which issues have been fixed.

*Acceptance Criteria:*

- Crash issues have status: `open`, `in_progress`, `resolved`, `ignored`
- Resolved issues reopen automatically if the same crash is seen in a newer app version

---

## 7. Release Ops — CI/CD Integration

### User Stories

**FR-7.1** As a developer, I want a CLI tool to create beta tracks from my CI/CD pipeline so that I can automate beta distribution on every build.

*Acceptance Criteria:*

- `npx @canopy/cli beta create --apk ./app.apk --track-name "v2.0-beta" --testers-file ./testers.json`
- Returns track ID and install URL prefix
- Exits with code 0 on success, non-zero on failure
- API key provided via `CANOPY_API_KEY` env var or `--api-key` flag

**FR-7.2** As a developer, I want a GitHub Actions workflow template so that I can integrate Canopy into a standard GitHub CI pipeline in minutes.

*Acceptance Criteria:*

- Workflow template published to Canopy docs
- Template: build APK → upload to Canopy beta track → notify Discord/Slack webhook
- Workflow uses `CANOPY_API_KEY` as a GitHub Actions secret

**FR-7.3** As a developer, I want the CLI to run pre-submission checks before I upload to the dApp Store so that I can catch policy violations early.

*Acceptance Criteria:*

- `npx @canopy/cli check --apk ./app.apk`
- Checks: APK signature present, package name format valid, manifest permissions (flags any dangerous permissions), no debug flags in release build, minimum target SDK version met
- Output: pass/warn/fail per check, with remediation notes
- This is a local static analysis tool; it does not make API calls to the dApp Store

---

## 8. Release Ops — Dashboard

### User Stories

**FR-8.1** As a developer, I want to see a version history for my app so that I can track what has been released and when.

*Acceptance Criteria:*

- Version list: version name, APK hash, upload date, dApp Store submission status, live/not-live
- For each version: linked crash reports, analytics comparison vs previous version

**FR-8.2** As a developer, I want to see my dApp Store submission status within the Canopy dashboard so that I don't have to switch between tools.

*Acceptance Criteria:*

- Integration with dApp Store Publisher Portal (read-only): shows current submission status (pending review, approved, rejected, live)
- Note: This requires the dApp Store portal to expose a status API. If unavailable, this feature is deferred.

---

## 9. Remote Configuration

### Overview

Remote config allows developers to change app behaviour without a new release. The Canopy version is on-chain-aware: feature flags can be conditioned on wallet attributes.

### User Stories

**FR-9.1** As a developer, I want to set feature flags that can be changed without a new app release so that I can roll out features gradually.

*Acceptance Criteria:*

- Key-value pairs: string, number, boolean, JSON
- SDK fetches config on app launch (with 1-hour cache)
- Fallback defaults defined in SDK initialization

**FR-9.2** As a developer, I want to gate feature flags by on-chain conditions so that I can automatically enable premium features for NFT holders without a smart contract.

*Acceptance Criteria:*

- Flag conditions: `if wallet holds [NFT collection]`, `if SKR balance >= [tier]`, `if Seeker Genesis Token`, `if wallet address in [list]`
- Conditions evaluated server-side at config fetch time (wallet address sent in request, hashed)
- Fallback value returned if on-chain check times out

---

## 10. Publisher Portal & Account Management

### User Stories

**FR-10.1** As a developer, I want a project dashboard that shows all my apps in one place.

*Acceptance Criteria:*

- App list with: name, package name, active beta tracks count, last analytics event, dApp Store status
- Quick-create new app

**FR-10.2** As a developer, I want to configure notifications so that I only receive alerts I care about.

*Acceptance Criteria:*

- Notification channels: email, webhook
- Configurable per event type: beta track expiry, new crash issue, submission status change, anomaly alert (traffic spike/drop)

**FR-10.3** As a developer, I want to generate API keys for CI/CD integration.

*Acceptance Criteria:*

- API keys scoped to: read-only, beta-track-write, full-access
- Keys displayed once; hash stored (not plaintext)
- Keys can be revoked
- Last-used timestamp shown per key

**FR-10.4** As a developer, I want to delete my account and all associated data so that I can comply with GDPR right-to-erasure requests.

*Acceptance Criteria:*

- Account deletion: soft-delete immediately, hard-delete within 30 days
- Analytics events associated with wallet addresses (hashed) are anonymised, not deleted (preserves aggregate data integrity)
- APK binaries in R2 storage are deleted immediately
- Arweave records (immutable by nature) contain only hashed identifiers and cannot be deleted — this is disclosed in the privacy policy

---

## Appendix: Event Taxonomy

Standard event names emitted by the SDK (auto and manual):

| Event Name | Auto? | Description |
|---|---|---|
| `app_session_started` | Auto | App entered foreground |
| `app_session_ended` | Auto | App entered background or was closed |
| `mwa_session_started` | Auto | MWA wallet connection initiated |
| `mwa_auth_granted` | Auto | Wallet authorised the app |
| `mwa_auth_revoked` | Auto | Wallet revoked authorisation |
| `mwa_transaction_signed` | Auto | User signed a transaction |
| `mwa_transaction_rejected` | Auto | User rejected a transaction signing request |
| `mwa_session_ended` | Auto | MWA session closed |
| `canopy_gate_reached` | Manual | User reached a token-gated feature |
| `canopy_gate_passed` | Manual | User passed the token gate |
| `canopy_gate_failed` | Manual | User failed the token gate |
| `[custom]` | Manual | Developer-defined event via `Canopy.track()` |
