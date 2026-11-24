# SeatView: final report (release candidate)

Date: 2026-11-24 · Branch: `feat/seatview-rc`, cut from `feat/cinema-discovery`. It is committed locally only: not pushed, not merged, and not deployed. Production (`seatview3d.vercel.app`) is unchanged.

**Read this first.**
- **No live showtimes:** no city has them, because no permitted provider exists yet.
- **No real email:** nothing is sent; messages go to a simulated outbox.
- **No staging environment:** there are no staging credentials.
- **Simulated in tests:** the showtime feed and email delivery. Everything simulated is labelled as such below.

## Screenshot gallery

**M1 baseline:**
- Full backend: [home 1440](docs/screenshots/M1/full-home-1440.png), [home 390](docs/screenshots/M1/full-home-390.png), [cinema 390](docs/screenshots/M1/full-cinema-390.png), [seat preview 390](docs/screenshots/M1/full-seat-preview-390.png), [profile 390](docs/screenshots/M1/full-profile-390.png)
- Frontend-only and outage: [frontend-only home 390](docs/screenshots/M1/frontend-only-home-390.png), [outage profile 390](docs/screenshots/M1/outage-profile-390.png)

**M2 discovery:**
- Landing: [1440](docs/screenshots/M2/landing-1440.png), [390](docs/screenshots/M2/landing-390.png)
- [Movies with the thumb dock, 390](docs/screenshots/M2/movies-dock-390.png)
- Journey A, search restored: [1440](docs/screenshots/M2/journey-a-restored-1440.png), [390](docs/screenshots/M2/journey-a-restored-390.png)

**M3 seat preview:**
- Overview: [1440](docs/screenshots/M3/overview-1440.png), [390](docs/screenshots/M3/overview-390.png)
- Selected seat: [1440](docs/screenshots/M3/selected-1440.png), [390](docs/screenshots/M3/selected-390.png)
- Compare: [1440](docs/screenshots/M3/compare-1440.png), [390](docs/screenshots/M3/compare-390.png), [phone sheet in compare](docs/screenshots/M3/compare-sheet-390.png)
- WebGL fallback: [1440](docs/screenshots/M3/fallback-1440.png), [390](docs/screenshots/M3/fallback-390.png)
- Camera videos of rapid selection: [1440](docs/screenshots/M3/rapid-selection-1440.webm), [390](docs/screenshots/M3/rapid-selection-390.webm)

**M4 accounts:**
- Saved items in a second session: [1440](docs/screenshots/M4/profile-saved-1440.png), [390](docs/screenshots/M4/profile-saved-390.png)
- Saved vs demo vs confirmed: [1440](docs/screenshots/M4/kinds-1440.png), [390](docs/screenshots/M4/kinds-390.png)

**M5 admin:**
- Feeds: [1440](docs/screenshots/M5/feeds-1440.png), [390](docs/screenshots/M5/feeds-390.png)
- Failed sync: [1440](docs/screenshots/M5/failed-sync-1440.png), [390](docs/screenshots/M5/failed-sync-390.png)
- Audit log: [1440](docs/screenshots/M5/audit-1440.png), [390](docs/screenshots/M5/audit-390.png)
- Layouts: [1440](docs/screenshots/M5/layouts-1440.png), [390](docs/screenshots/M5/layouts-390.png)
- Visitor sees the correction: [1440](docs/screenshots/M5/visitor-sees-correction-1440.png), [390](docs/screenshots/M5/visitor-sees-correction-390.png)

**Acceptance:** [docs/screenshots/acceptance/](docs/screenshots/acceptance/) covers A (pointer, reduced motion, keyboard), the B update and the C visitor, in Chromium desktop, Chromium 390 and WebKit 390.

## Setup

```bash
npm ci
npx playwright install chromium webkit
npm start                                   # build + serve on http://127.0.0.1:3001 (embedded PGlite)
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/seatview npm start      # with PostgreSQL
npm run admin:grant -- you@example.com      # first admin, then sign in at /admin with two-step sign-in
```

Checks:

```bash
npm run typecheck
npm test                                                     # PGlite
TEST_DATABASE_URL=postgres://…/seatview_test npm test        # PostgreSQL (wipes that database)
TEST_DATABASE_URL=postgres://…/seatview_test npm run migrate:check
SOURCE_DATABASE_URL=… RESTORE_DATABASE_URL=…/x_test node scripts/restore-drill.mjs
```

End-to-end backend (simulated feed, development outbox, admin two-step sign-in on):

```bash
DATABASE_URL=postgres://…/seatview_test node e2e/support/reset-test-db.cjs
DATABASE_URL=postgres://…/seatview_test PORT=3100 APP_ORIGIN=http://127.0.0.1:3100 FEED_PROVIDER=fixture \
  FEED_FIXTURE_FILE=.e2e-data/feed.json DEV_OUTBOX=true ADMIN_MFA_REQUIRED=true RATE_LIMIT_MAX=100000 \
  RATE_LIMIT_HOLDS_MAX=100000 npx tsx server/index.ts --static
E2E_BASE_URL=http://127.0.0.1:3100 E2E_DATABASE_URL=postgres://…/seatview_test npx playwright test --project=chromium-desktop
```

**Staging URL:** none exists. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Tests that ran

| Suite | Where | Result |
|---|---|---|
| Type check | local | Passed |
| Vitest | PGlite | 128 passed, 5 skipped |
| Vitest | PostgreSQL 18 (`seatview_test`) | 132 passed (before the final CSP test; see M6) |
| Migration check | PGlite and PostgreSQL | 1–6 applied, rerun applied nothing |
| Production build | local | Passed: two entry points (site and admin) |
| Playwright acceptance A, B, C | Chromium 1440, Chromium 390, WebKit 390 | 10 passed, 2 skipped (keyboard run is desktop Chromium only) |
| Keyboard-only journey A | Chromium 1440 | Passed |
| Reduced motion (A plus seat view) | Chromium 1440 and 390, WebKit 390 | Passed |
| Seat preview, camera, discovery | WebKit 390 | 14 passed, 1 skipped (CPU throttling is Chromium-only) |
| Final regression (M2, M3, M4) | Chromium 1440 and 390 | FINAL_REGRESSION_1 |
| Admin (M5) | Chromium 1440 and 390, two-step sign-in on | 8 passed (last run in M5) |
| CI smoke | Built app on PostgreSQL, Chromium | 12 passed, 3 skipped |
| Log privacy | Real server, 638 lines | 0 emails, cookies or client addresses |
| Backup restore drill | `seatview` → `seatview_test` | 20 tables, 95,796 rows, no mismatches |

The GitHub Actions workflow has not run on GitHub, because the branch isn't pushed. Its steps ran locally as above.

### Performance (same device profile, server and database)

Chromium at 390×844 with 4× CPU slowdown, 150 ms RTT and 1.6 Mbps down. Each LCP figure is the median of 3 cold-cache loads. Raw: [before](docs/perf/before.json), [after](docs/perf/after.json).

| Measure | Before | After | Target |
|---|---|---|---|
| LCP, landing | 2884 ms | 1688 ms | under 2500 ms |
| LCP, discovery | 2660 ms | 1400 ms | under 2500 ms |
| Seat-selection INP | 200 ms | 136 ms | under 200 ms |

The before INP was measured by clicking seats in the 3D canvas, because the 2D seat map did not exist yet. The after INP uses the seat map. The main LCP gain came from three.js (195 KB gzipped) no longer loading on discovery pages.

## Live-data coverage by city

| City | Live | Cached | Link-only | Blocked |
|---|---|---|---|---|
| Chennai | No | No | Yes, 3 cinemas | Live times blocked: no permitted provider |
| Hyderabad | No | No | Yes, 3 cinemas | Same |
| Mumbai | No | No | Yes, 3 cinemas | Same |
| Bengaluru | No | No | Yes, 3 cinemas | Same |
| Kochi | No | No | Yes, 3 cinemas | Same |

All 15 venue-specific links were re-checked on 2026-11-24 against District's public city listings, and all are still listed.

## Simulated vs verified

| Capability | Status |
|---|---|
| Cinema directory and provider links | **Verified externally:** live District listings, 2026-11-24 |
| Showtime imports, outages, changes, alerts | **Simulated:** `FEED_PROVIDER=fixture`, refused in production |
| MovieGlu adapter | **Not exercised:** parses the documented response shape only. Its evaluation licence forbids publishing data. |
| Email verification and password reset | **Simulated delivery:** links are read from the dev outbox (test addresses only) |
| Provider page opened from journey A | **Stubbed in the test:** the link URL is checked, but District is not loaded |
| TOTP two-step sign-in | **Real algorithm:** checked against the RFC 6238 test vectors; codes computed in tests as an authenticator would |
| PostgreSQL behaviour | **Real:** local PostgreSQL 18 |
| Hosting, Docker, staging | **Not run** |

## Remaining launch blockers

1. **Showtime provider:** live times need a provider with a licence that allows publishing (for example a commercial MovieGlu licence). Then add each cinema's provider ID in `/admin`.
2. **Email provider:** real verification, reset and reminder emails need a provider account and credentials. Only `MAILER=outbox` exists.
3. **Hosting for the API and PostgreSQL:** Vercel serves the frontend only, so accounts and admin are off in production.
4. **Staging:** no environment or credentials exist, so there's been no staging smoke test.
5. **Docker:** never built or run here, because Docker isn't installed.
6. **Real devices:** physical iPhone and Android checks are still needed, especially the bottom search dock with the on-screen keyboard.
7. **Admin hardening:** TOTP recovery codes, and encrypting the stored TOTP secret.
8. **Release approval:** the branch needs review, a push, CI on GitHub, and your "authorize release".

## Architecture in plain English

SeatView is one TypeScript codebase with three parts. A React site, built with Vite, handles discovery and booking. It loads the three.js seat viewer only when someone opens a 3D view, so the first page stays light. A separate React admin app has its own entry page and bundle. One Fastify server on Node serves both, plus a JSON API.

PostgreSQL stores cinemas, aliases, provider links, auditoriums, layout verifications, films, screenings, accounts, saved items, alerts and an audit log. Versioned SQL migrations run at startup under a lock. Showtime providers sit behind a small adapter interface. Imports are idempotent, keep cached results when a provider fails, and write alerts in the same transaction, so each user hears about a change once.

Accounts use HttpOnly session cookies. Admin roles and two-step codes are checked on the server for every request.

**The key tradeoff:** a single server and a single origin, with polling instead of push. That keeps cookies, security and deployment simple, and works on static hosts. The cost is that visitors see admin corrections up to 30 seconds late, rather than instantly.
