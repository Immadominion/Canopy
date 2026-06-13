# Canopy — End-to-End Manual Test Checklist

Work top to bottom. When every box is ticked, you've exercised the whole platform.
Each item is one line: **what to do → what "pass" looks like**.

> Repo root: `/Users/mac/Documents/codes/opensauce/canopy` · Node 24+ · pnpm 10.33.1

---

## 0. Bootstrap (do once)

- [ ] `pnpm install` at repo root → completes (peer-dep warnings are fine).
- [ ] `pnpm -r typecheck` → all packages pass, incl. `@canopy/web` and `@canopy/tester`.
- [ ] `pnpm -r lint` → all packages pass (0 warnings).
- [ ] `pnpm build` → every app/package builds.

---

## 1. Database (Supabase)

> `config.toml` is committed. `supabase start` boots the stack **and applies migrations**. Manage it with the Supabase CLI, never the Docker UI (`supabase stop` / `supabase start`). The local Postgres image has no TimescaleDB, so `0002`/`0013` auto-fall-back to plain Postgres views. Run SQL with `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

- [ ] `supabase start` → Postgres + Studio boot; prints keys + the `…54322/postgres` conn string.
- [ ] All **17 migrations** (`0001`→`0017`) are applied: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;` → ends at `0017`. _(If you have an older local DB, 0016/0017 may need a manual apply — `psql … -f supabase/migrations/0017_delete_app_cascade.sql` — then insert the version rows; a fresh `supabase start` applies everything.)_
- [ ] `\dt` → see `publishers`, `apps`, `beta_tracks`, `beta_testers`, `access_requests`, `analytics_events`, `crash_reports`, `releases`, `organizations`, `remote_configs`, `experiments`, `billing_payments`.
- [ ] `\d beta_tracks` → has `apk_deleted_at` (purge marker) and `seeker_only`.
- [ ] `\df delete_app_cascade` → function exists; `SELECT has_function_privilege('authenticated','delete_app_cascade(uuid)','execute');` → **false** (locked to service_role).
- [ ] `SELECT rowsecurity FROM pg_tables WHERE tablename='publishers';` → RLS is `true`.
- [ ] Copy the printed anon + service_role keys into `apps/web/.env.local` (see §2).

---

## 2. Web Dashboard (`apps/web`)

> `cp apps/web/.env.example apps/web/.env.local`. **GOTCHA:** `src/lib/env.ts` validates env at boot — a missing required var crashes the app on first request (`[canopy] Invalid environment variables`). **Required:** Supabase, R2, Helius, JWT, Irys, and `RESEND_API_KEY` (a placeholder `re_x` is fine if you aren't testing team-invite email). **Optional — features degrade gracefully when unset, no crash:** `VIRUSTOTAL_API_KEY` (malware scan), `TELEGRAM_*` (approvals), `HERALD_API_KEY` (dev notifications), `CANOPY_MERCHANT_WALLET` (USDC billing). **Stripe is gone — billing is on-chain USDC.** **Restart the dev server after any `.env.local` edit.** Then `pnpm -F @canopy/web dev` → http://localhost:3000

- [ ] Visit `/sign-in` → wallet connect (SIWS) prompt renders; sign-in notice links to `/terms` + `/privacy`; `/api/v1/auth/nonce` returns a nonce.
- [ ] `/terms` and `/privacy` render.
- [ ] Sign in with a wallet → redirected to `/dashboard/apps`; session cookie set; a `publishers` row is auto-created (unverified).
- [ ] **Publisher gate:** an unverified wallet sees **"Request Publisher Access"**, not the app list.
- [ ] Submit name + project → status `pending`; you get a prefilled `t.me/<founder>` link + (if bot configured) a Telegram Approve/Reject message.
- [ ] **Approve** the request (Telegram button §9, or the approve SQL in §9). Dashboard unlocks.
- [ ] `/dashboard/apps` → lists apps (or empty state); **create an app works (only after approval)**.
- [ ] `/dashboard/apps/[appId]` → app detail shows track list + expiry countdown; header has **SETTINGS** and **+ UPLOAD BUILD**.
- [ ] `/dashboard/apps/[appId]/upload` → select an APK (leave VERSION blank → auto-detected) → beta track created (`pending_scan`). _(APKs >10MB rely on the proxy matcher exclusion + a dev-server restart.)_
- [ ] `/dashboard/apps/[appId]/tracks/[trackId]` → add a tester wallet → tester count increments; cap shows 200.
- [ ] Beta scan: track shows `pending_scan` → (with `VIRUSTOTAL_API_KEY`) `scan_passed` → **ACTIVATE TRACK** → `active`. Without the key it stays `scan_in_progress` (expected).
- [ ] **Revoke** a track (track page → REVOKE) → status `revoked`, **BINARY PURGED** appears; confirm the R2 object is gone and `/install/[trackId]` 404s. _(reuses `apk_deleted_at`.)_
- [ ] **Delete build** (track page → DELETE BUILD → CONFIRM) → returns to app detail; the track + its testers/install rows are gone (Arweave fingerprint record remains).
- [ ] **App settings:** `/dashboard/apps/[appId]/settings` → edit name/description/dApp-Store-ID → SAVE works; package name is read-only.
- [ ] **Delete app (cascade):** Settings → Danger Zone → type the app name → DELETE PERMANENTLY → redirected to `/dashboard/apps`; the app, all its builds, and their R2 binaries are gone.
- [ ] `/install/[trackId]` → **OPEN IN CANOPY** (deeplinks `canopy://beta/<trackId>`; falls back to the dApp Store) + an **"Advanced: direct APK download"** warned, wallet-gated fallback. Never a public APK link.
- [ ] `/dashboard/apps/[appId]/analytics` (+ `/events`, `/retention`, `/cohorts`, `/funnels`, `/experiments`, `/sessions/[id]`) → each renders.
- [ ] `/dashboard/apps/[appId]/crashes` → crash groups (deduped by fingerprint); open one → stack trace + count.
- [ ] `/dashboard/apps/[appId]/remote-config` → add a flag → deploy → rollback works.
- [ ] `/dashboard/org` + `/dashboard/org/invite` → invite → accept via `/dashboard/accept-invite`. _(invite email needs a REAL `RESEND_API_KEY`.)_
- [ ] `/dashboard/settings/api-keys` → create an API key (copy it — used in §3/§5/§6) → revoke works.
- [ ] `/dashboard/billing` → **pay-to-extend with USDC** (needs `CANOPY_MERCHANT_WALLET` + a wallet holding USDC). Without a merchant wallet the upgrade UI is hidden (no crash). A payment is bound to your session wallet (a foreign tx signature → 403 PAYER_MISMATCH) and idempotent by signature.
- [ ] `/dashboard/tools` → ecosystem hub (gib.work, Herald, Helius, Dialect) renders with icons.
- [ ] Org webhooks: create an endpoint under app settings → webhooks → delivery log records an event.
- [ ] **Panel scroll:** on a long page (e.g. analytics), the content scrolls **inside the rounded panel** — the sidebar + the panel's rounded frame and padding stay fixed (the whole window doesn't scroll). Navigating to another page resets the panel to the top.

---

## 3. Ingest Service (`apps/ingest`)

> `pnpm -F ingest dev` → http://localhost:8787 (wrangler). Needs `API_KEYS_KV` populated with your test key + Hyperdrive/Supabase set in `wrangler.toml`.

- [ ] `GET /health` → `{ status: "ok", service: "canopy-ingest" }`.
- [ ] `POST /v1/events` with 5 valid events (valid apiKey+appId) → `202` `{ accepted: 5, rejected: 0 }`.
- [ ] Re-POST the same event `id` → `rejected: 1` (dedup via KV).
- [ ] `POST /v1/events` with a bad apiKey → `401`; missing a required field → `400` with Zod detail.
- [ ] Hammer `/v1/events` rapidly → eventually `429` (rate-limiter Durable Object).
- [ ] `POST /v1/crashes` → `{ received: true }`; row in `crash_reports`. Re-POST same `fingerprint` → `occurrence_count` increments.
- [ ] Ingested events surface in the web analytics dashboard (§2).

---

## 4. React Native SDK + Example App (`packages/sdk` via `apps/example`)

> `cp apps/example/.env.example apps/example/.env.local`, fill API key + app ID (`EXPO_PUBLIC_CANOPY_INGEST_URL=http://10.0.2.2:8787` for local ingest). `pnpm -F @canopy/example android` (needs Android device/emulator + a Solana wallet app).

- [ ] `pnpm -F @canopy/react-native typecheck` and `lint` → pass.
- [ ] App launches; **CONNECT WALLET** → MWA sheet → approve → `mwa_session_start` / `mwa_wallet_connected` / `mwa_session_end` appear in the on-screen log.
- [ ] `identify()` fired (wallet hashed on-device, plaintext never sent).
- [ ] **TRACK BUTTON_PRESSED** / **TRACK PAGE_VIEW** → events log + flush to ingest.
- [ ] Remote Config shows `feature_new_swap_ui` + `onboarding_variant`; change a flag in the dashboard → value updates (stale-while-revalidate).

---

## 5. CLI (`packages/cli`)

> `pnpm -F @canopy/cli build` then `node packages/cli/dist/index.js <cmd>` (or `canopy` if linked).

- [ ] `config set-key <apiKey>` → `config show` → key stored + masked.
- [ ] `config set-url http://localhost:3000/api/v1` → URL saved.
- [ ] `check <app.apk>` → manifest table (package/version/minSdk/permissions), or graceful warning if `aapt2`/`aapt` missing.
- [ ] `beta create --app <id> --apk <file> --version-name 1.0.0 --version-code 1 --expires-in 14 --notes "..."` → returns track ID + expiry; rejects >200MB / non-`.apk`.
- [ ] `beta list <appId>` → table matching the dashboard.
- [ ] `release init --app <id> --track <id> --out .` → writes a `dapp-store.yaml` template; `release validate --config dapp-store.yaml` → passes for valid, errors on broken.

---

## 6. GitHub Actions (`packages/action-beta-deploy`, `packages/action-release`)

> Test via a workflow push, or locally with [`act`](https://github.com/nektos/act). Point `CANOPY_API_URL` at local web.

- [ ] **action-beta-deploy**: run with api-key/app-id/apk-path/version → outputs `track-id`, `expires-at`, `tester-cap=200`; track appears in dashboard. Oversized/missing APK → clear failure.
- [ ] **action-release**: pre-submission checks → `checks-passed` + `check-summary`; APK <200MB & minSdk≥30 → pass. `fail-on-check-failure=true` with a failing check → step fails; release record still created.

---

## 7. Docs Site (`apps/docs`)

> `pnpm -F @canopy/docs dev` → http://localhost:3001

- [ ] Site loads; pages render: index, getting-started, sdk-reference, api-reference, github-actions, expo, bare-react-native.
- [ ] OpenAPI / API reference renders (Scalar); internal nav + search work.

---

## 8. Cross-cutting / Guardrails (the "can't be a shadow app store" checks)

- [ ] Creating a beta track requires an **approved** publisher → unverified/pending wallet is blocked.
- [ ] Tester cap can't exceed 200 (try 201 → rejected).
- [ ] Build expiry can't exceed 30 days (try 31 → rejected); default 14.
- [ ] No public/transferable install link — install is wallet-bound + requires allowlist + signed authorization.
- [ ] Beta track has no public listing/search/discoverable URL.
- [ ] Revoked/deleted builds purge the APK binary from R2 (no lingering bytes).

---

## 9. Publisher verification & Telegram approval

> The gate between sign-in and using the dashboard. Wallets start unverified; you approve them. Env (optional): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_FOUNDER_TELEGRAM`, `ADMIN_WALLET_HASHES`.

- [ ] After submitting, the founder's Telegram receives **Approve / Reject** (outbound — needs only bot token + chat id).
- [ ] The "Request submitted" screen shows a verification code + prefilled `t.me/<founder>` deep link.
- [ ] **Approve via SQL** (no webhook needed), then refresh → apps unlock:

  ```sql
  update access_requests set status='approved', decided_at=now(), decided_by='wallet:local' where status='pending';
  update publishers set verification_status='approved', kyc_verified=true, kyc_verified_at=now() where verification_status='pending';
  ```

- [ ] **Approve via Telegram buttons** (needs a public webhook): `cloudflared tunnel --url http://localhost:3000` → `setWebhook` with `secret_token` → tap Approve (status flips; message edits to "Approved ✅").
- [ ] Webhook security: a non-admin chat id / tampered button is rejected; only `TELEGRAM_ADMIN_CHAT_ID` can decide.
- [ ] Admin API fallback: with `ADMIN_WALLET_HASHES` set, `POST /api/v1/admin/access-requests/[id]/decision {decision:"approve"}` works only for the allowlisted wallet (403 otherwise).

---

## 10. Canopy Tester App (`apps/tester`) — the dApp-Store install path

> The TestFlight-equivalent: testers install Canopy from the dApp Store, then install wallet-allowlisted betas through it (verified before install). Seeker connected over adb + USB debugging authorized. `cp apps/tester/.env.example apps/tester/.env`. **Connect the Seeker over USB and run `adb reverse tcp:3000 tcp:3000`**, then set `EXPO_PUBLIC_CANOPY_API_URL=http://localhost:3000` — the phone reaches Metro _and_ the API over the USB tunnel (LAN IPs get blocked by the macOS firewall). Re-run the `adb reverse` command after the device reconnects.

- [ ] `pnpm -F @canopy/tester typecheck` + `lint` → pass.
- [ ] `adb devices` → the Seeker shows as `device`; `adb reverse tcp:3000 tcp:3000` succeeds.
- [ ] `pnpm -F @canopy/tester prebuild` → generates `android/`, autolinks `modules/canopy-installer`.
- [ ] `pnpm -F @canopy/tester android` → dev build installs + launches on the Seeker.
- [ ] **Branding:** launcher icon + splash show the teal Canopy tree on the dark `#0E0E10` canvas; **Connect** and **Apps** screens show the tree mark (not a white square).
- [ ] **Connect** screen → CONNECT WALLET → MWA sheet → approve + sign → lands on **Apps** (session stored in keystore).
- [ ] On the web (§2), add this wallet to an **active** track's allowlist → pull-to-refresh in the app → the beta appears in **Apps** with app name + version + size.
- [ ] Tap the beta → detail shows **What's New** + **Details** + **Fingerprint** + a large **INSTALL** button. First time (permission not yet granted), a one-time heads-up about the "install unknown apps" prompt is shown.
- [ ] Tap **INSTALL** → progress bar shows a **real download %** (uploaded/total) → **VERIFYING FINGERPRINT** → INSTALLING → the OS install dialog appears (first time: prompts to allow Canopy to install unknown apps) → app installs; button shows INSTALLED ✓.
- [ ] **List reflects device state:** after installing, the **Apps** list chip for that beta reads **INSTALLED** (and **UPDATE** once a newer build is published) — refreshes when you return to the list, not just on pull-to-refresh.
- [ ] **Update detection:** push a higher `versionCode` build to the same track → reopen the beta → button reads **UPDATE** with "You have build N · build M is available"; after updating it settles to INSTALLED ✓. Reopen an already-current beta → button is **INSTALLED ✓** (disabled).
- [ ] **Install-failure clarity:** install a build over a copy that was signed with a **different key** (e.g. a Play/debug build of the same package) → instead of a generic `FAILED`, the app shows `SIGNATURE_MISMATCH` with guidance + a **REMOVE OLD COPY** button; tapping it launches the OS uninstall, after which INSTALL succeeds.
- [ ] **Revoke → remove:** on the web (§2), revoke the track → in the app the beta shows **REVOKED — no longer supported** (not silently gone). If the build is still installed, a **REMOVE APP** button launches the OS uninstall confirmation; the installed APK is never silently removed. An expired track shows **EXPIRED** the same way.
- [ ] **Deep-link + resume:** open `/install/[trackId]` on the phone's browser → **OPEN IN CANOPY** launches the app straight to that beta. Signed out, it routes to Connect first, then resumes to the beta after signing in.
- [ ] **Session refresh:** with a beta open, leave the app idle past the access-token expiry (or shorten it) → pull-to-refresh / reopen → it silently refreshes (no bounce to Connect). Only a revoked/expired refresh token sends you back to Connect.
- [ ] **Transient retry:** briefly drop the network mid-download → it retries with backoff rather than failing instantly (the hash gate still rejects any partial/garbled result).
- [ ] **SIGN OUT** (Apps header) → returns to Connect; the stored session is cleared.

> Hash-gate (can't easily force by hand): if `sha256(downloaded apk) !== fingerprint`, the app deletes the file and shows `HASH_MISMATCH` instead of installing.

---

## 11. Publishing the tester app to the Solana dApp Store (Phase 3)

> Needs a dApp Store publisher account, signing keypair, some SOL, and listing assets. See `apps/tester/README.md`.

- [ ] `@solana-mobile/dapp-store-cli` configured; publisher NFT minted.
- [ ] `npx dapp-store create` / `publish` → listing live; `solanadappstore://details?id=app.canopy.tester` opens it.

---

### Done when every box above is ticked. 🌳
