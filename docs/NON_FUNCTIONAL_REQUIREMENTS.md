# Non-Functional Requirements

**Project:** Canopy (working name)
**Document version:** 1.0
**Status:** Draft — under active revision

This document describes the quality attributes and constraints the system must satisfy. These are system-wide unless scoped to a specific component.

---

## 1. Performance

| ID | Requirement | Target | Measurement |
|---|---|---|---|
| NFR-P1 | Dashboard page load (First Contentful Paint) | < 1.5s on 4G | Lighthouse / WebPageTest |
| NFR-P2 | Analytics ingest latency (event received → stored) | < 500ms p95 | Service telemetry |
| NFR-P3 | Analytics query response (dashboard chart render) | < 3s p95 for queries over 30-day window | Application tracing |
| NFR-P4 | APK download initiation (signed URL issue to download start) | < 2s | Client-side measurement |
| NFR-P5 | SDK initialisation overhead | < 50ms added to app cold start | RN Performance profiler |
| NFR-P6 | Publisher verification check (on login) | < 3s p95 | API latency tracking |
| NFR-P7 | SDK event queue flush | < 30s under normal conditions; < 5s on app close | SDK telemetry |

### Notes

- Analytics queries must remain performant as event volumes grow. TimescaleDB hypertable partitioning on the `analytics_events` table by time is required from day one.
- The ingest path (SDK → Cloudflare Worker → Supabase) must not block or degrade the user-facing app in any measurable way. All writes are fire-and-forget with local queuing.

---

## 2. Scalability

| ID | Requirement |
|---|---|
| NFR-S1 | The analytics ingest service must handle at least 10,000 events/second at steady state without degradation |
| NFR-S2 | The database schema must be designed to support 1 billion analytics events without a full migration |
| NFR-S3 | APK storage must support concurrent downloads from 200 testers simultaneously per track without rate limiting |
| NFR-S4 | The dashboard must remain usable with 500 concurrent active sessions |
| NFR-S5 | Horizontal scaling of the ingest service must be possible without code changes (stateless worker design) |

### Scaling Strategy

- **Ingest**: Cloudflare Workers are globally distributed and scale automatically. No persistent state in the worker — all writes go to Supabase.
- **Database**: Supabase (Postgres) handles OLTP. As analytics volume grows, the `analytics_events` table will be migrated to a dedicated time-series store (ClickHouse or TimescaleDB Cloud). The schema is designed for this migration from the start.
- **APK Storage**: Cloudflare R2 with Cloudflare CDN layer. No egress fees. Naturally scales.

---

## 3. Availability

| ID | Requirement |
|---|---|
| NFR-A1 | Dashboard availability: 99.5% monthly uptime target |
| NFR-A2 | Analytics ingest availability: 99.9% monthly uptime target (data loss is worse than dashboard downtime) |
| NFR-A3 | APK download availability: 99.9% monthly uptime target (a tester hitting a broken download link is a critical failure) |
| NFR-A4 | The SDK must degrade gracefully if the ingest service is unreachable: queue events locally, retry with exponential backoff |
| NFR-A5 | Maximum planned maintenance window: 2 hours; must be communicated 24 hours in advance |

### Recovery Targets

| Component | RTO | RPO |
|---|---|---|
| Dashboard | 1 hour | 4 hours |
| Analytics ingest | 15 minutes | 5 minutes |
| APK storage | 15 minutes | 0 (R2 is durable) |
| Database | 30 minutes | 1 hour |

---

## 4. Security

### Authentication & Authorisation

| ID | Requirement |
|---|---|
| NFR-SEC1 | All API endpoints require authentication. No unauthenticated endpoints except the SIWS nonce endpoint and the public health check. |
| NFR-SEC2 | SIWS signatures must be verified server-side using a time-limited nonce (5-minute window). Replay attacks must be rejected. |
| NFR-SEC3 | API keys must be stored as bcrypt hashes (cost factor ≥ 12). Only the prefix (first 8 chars) is stored in plaintext for display purposes. |
| NFR-SEC4 | All role-based access control (RBAC) checks must be enforced at the database layer using Supabase Row-Level Security (RLS) policies, not only at the application layer. |
| NFR-SEC5 | JWT sessions must be short-lived (24 hours) with refresh tokens. Refresh tokens must be rotated on use. |

### APK Distribution Security

| ID | Requirement |
|---|---|
| NFR-SEC6 | APK download URLs must be signed with a short-lived HMAC token (15-minute TTL). Unsigned or expired URLs must return 403. |
| NFR-SEC7 | Signed download URLs must be wallet-bound. The wallet address that triggered authentication must be encoded in the URL token. A different wallet accessing the same token must be rejected. |
| NFR-SEC8 | All uploaded APKs must be scanned for malware using a static analysis service before a beta track can be activated. |
| NFR-SEC9 | APK binaries must be stored in a private Cloudflare R2 bucket. No public access. All access is via signed URLs only. |
| NFR-SEC10 | On beta track expiry or manual close, APK binaries must be deleted from R2 storage within 1 hour. |

### Data Security

| ID | Requirement |
|---|---|
| NFR-SEC11 | All data in transit must use TLS 1.2 or higher. TLS 1.0 and 1.1 must be explicitly disabled. |
| NFR-SEC12 | All data at rest in Supabase must be encrypted (Supabase provides AES-256 at rest by default). |
| NFR-SEC13 | Wallet addresses used as analytics identifiers must be hashed (SHA-256) by default. The opt-in to store plaintext wallet addresses must be accompanied by explicit acknowledgment in the developer's Canopy settings. |
| NFR-SEC14 | Secret keys (API keys, keypairs) must never be logged. Logging pipelines must have a secret scrubber configured. |

### Infrastructure Security

| ID | Requirement |
|---|---|
| NFR-SEC15 | Supabase RLS must be enabled on all tables. Direct database access without RLS bypass must be impossible from application code. |
| NFR-SEC16 | The analytics ingest endpoint must be rate-limited per API key: 1,000 events/second burst, 100 events/second sustained. |
| NFR-SEC17 | Admin-level API endpoints must require re-authentication (fresh SIWS signature) in addition to a valid session. |
| NFR-SEC18 | Dependency audits must run in CI on every pull request (`npm audit` with fail threshold at `high`). |

---

## 5. Privacy & Compliance

| ID | Requirement |
|---|---|
| NFR-PRIV1 | The system must comply with GDPR. A Data Processing Agreement (DPA) must be available for Pro and Scale tier customers. |
| NFR-PRIV2 | The system must comply with CCPA. California users must be able to request data export and deletion. |
| NFR-PRIV3 | Wallet addresses are treated as personal data under GDPR where they are linkable to an individual. Default hashing satisfies pseudonymisation requirements. |
| NFR-PRIV4 | A privacy policy must be published and linked from every page of the dashboard and from the SDK documentation. |
| NFR-PRIV5 | Arweave records are immutable and cannot be deleted. These records must contain only hashed identifiers (no plaintext wallet addresses, no email addresses). This limitation must be disclosed in the privacy policy. |
| NFR-PRIV6 | The SDK must support a "consent mode" where event collection is paused until the developer signals user consent. This is required for apps targeting EU users. |
| NFR-PRIV7 | Canopy must not sell, share, or use developer analytics data for any purpose other than providing the Canopy service to that developer. |

---

## 6. Reliability & Data Integrity

| ID | Requirement |
|---|---|
| NFR-R1 | Analytics events must not be lost in transit due to transient network failures. SDK must implement persistent local queue with at-least-once delivery. |
| NFR-R2 | Analytics events must be idempotent: duplicate events (from SDK retry) must not double-count. Events must include a client-generated UUID for deduplication. |
| NFR-R3 | APK file integrity must be verified on upload (SHA-256 hash computed server-side and stored). Downloads are verified against the stored hash. |
| NFR-R4 | Beta track tester counts must be consistent. Race conditions on the 200-tester cap must be prevented using database-level constraints. |
| NFR-R5 | Database migrations must be backward compatible. No destructive schema changes without a deprecation period. |

---

## 7. Observability

| ID | Requirement |
|---|---|
| NFR-OBS1 | All API endpoints must emit structured logs (JSON) with: request ID, wallet address (hashed), endpoint, response status, latency. |
| NFR-OBS2 | The analytics ingest service must expose Prometheus-compatible metrics: events/second, queue depth, error rate, p50/p95/p99 latency. |
| NFR-OBS3 | Distributed tracing (OpenTelemetry) must be implemented across the dashboard API and ingest service. |
| NFR-OBS4 | A status page must be maintained (public-facing) showing real-time system health for dashboard, ingest, and APK distribution. |
| NFR-OBS5 | Alerts must fire on: error rate > 1% over 5 minutes, ingest latency p95 > 1s, APK download failure rate > 5%. |

---

## 8. Maintainability & Developer Experience

| ID | Requirement |
|---|---|
| NFR-M1 | The monorepo must be set up with Turborepo. All packages share TypeScript configuration. |
| NFR-M2 | All public-facing APIs must have TypeScript types exported from `@canopy/types` shared package. |
| NFR-M3 | Database schema must be managed exclusively through Supabase migrations (not manual SQL). All migrations are version-controlled. |
| NFR-M4 | The SDK must be tree-shakeable. Unused SDK features must not add to the developer's app bundle size. |
| NFR-M5 | CI must run: type check, lint, unit tests, and integration tests on every pull request to `main`. Merging is blocked if any check fails. |
| NFR-M6 | Environment variables must be validated at startup using a schema (e.g. `zod`). Missing required variables must cause a clear startup failure, not a runtime error. |

---

## 9. Accessibility

| ID | Requirement |
|---|---|
| NFR-ACC1 | Dashboard must meet WCAG 2.1 AA standards. |
| NFR-ACC2 | All charts must have accessible text alternatives (data tables accessible via keyboard navigation). |
| NFR-ACC3 | Colour is never the sole means of conveying information (critical for analytics dashboards). |

---

## 10. Compatibility

| ID | Requirement |
|---|---|
| NFR-C1 | The SDK targets React Native 0.73+. |
| NFR-C2 | The SDK targets Android API level 33+ (Android 13), which is the minimum for the Seeker. |
| NFR-C3 | The dashboard supports: Chrome 120+, Firefox 120+, Safari 17+, Edge 120+. |
| NFR-C4 | The CLI runs on Node.js 20+ (LTS). |
| NFR-C5 | The SDK must be compatible with Expo SDK 51+ in addition to bare React Native. |
