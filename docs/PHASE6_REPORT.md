# SeatView3D — Phase 6 Report (Production hardening)

Date: 2026-11-22. Scope, as you chose it: server security & limits, booking correctness, single deployable build, versioned DB migrations.

## 1. Server security & limits

- **Validated config** (`server/config.ts`): every setting comes from an environment variable with range and format checks. Invalid values stop startup with *all* problems listed. The table is in the README.
- **Rate limiting** (`@fastify/rate-limit`), per client IP:
  - 300 requests/min across API routes
  - 60/min for hold and confirm (each route counted separately)
  - JSON `429 {code: RATE_LIMITED}` with `Retry-After`
  - Behind your own proxy, `TRUST_PROXY=true` makes the limits use the real client IP.
- **Security headers** (`@fastify/helmet`): CSP `default-src 'self'` (the built app needs nothing else), `X-Frame-Options`, `nosniff`, HSTS, and the rest of helmet's defaults.
- **Strict CORS:** no CORS headers by default (same-origin only). `ALLOWED_ORIGINS` enables exact origins only. POST bodies must be `application/json` (415 otherwise), which blocks simple cross-site form posts.
- **Input validation on every route:**
  - event ID pattern
  - seat ID pattern, so input like `<script>` gets a 400
  - hold IDs must be UUIDs, in the URL and in the body
  - 16 kB body limit
- **Error handling:** framework client errors (413/415/429) pass through with their status code. Server errors return a generic 500 without internal details, and are logged.
- **Health:** `/api/health` (liveness) and `/api/ready` (database ping; 503 if the database is unreachable).

## 2. Booking correctness

- **Idempotent confirm:** a retried confirm (double click, network drop after commit) returns the *same* booking instead of "hold expired".
  - Server: migration 002 adds `bookings.hold_id` with a unique index.
  - The offline mock behaves the same way.
- **Background sweep** of expired holds every 60 s (configurable). Expired holds are also still cleared at the start of every request.
- **Availability refreshes every 15 s** while you're choosing seats, paused when the tab is hidden. Other customers' holds and sales appear without a reload.
- Error messages from the server, such as rate limiting, now reach the user instead of "Something went wrong".

## 3. Single deployable build

- `npm start` builds the app, then runs one Node process serving both the app and the API on :3001.
- **Caching:** hashed `/assets/*` get `max-age=31536000, immutable`; `index.html` gets `no-cache`. Availability responses are `no-store`.
- **gzip/brotli** (`@fastify/compress`). Stadium availability: **184,761 → 38,779 bytes**.
- **Bundle split:** the app's own code is now 32.6 kB (11.2 kB gzipped), down from a single 1.19 MB bundle. React (394 kB) and three.js (788 kB) are separate long-cached chunks, so an app update only re-downloads the small chunk.
- Unknown `/api/*` routes return JSON 404.
- Starting in static mode without a build fails with "run npm run build first".
- `tsx` moved to runtime dependencies, because the production server runs on it.

## 4. Versioned migrations

- `server/migrations/NNN_name.sql`, applied in order, each in its own transaction, recorded in `schema_migrations`.
- An advisory lock stops two server instances migrating at the same time.
- 001 is the Phase 5 schema, written as `IF NOT EXISTS` so existing databases are baselined. 002 adds `hold_id`.
- **Applied to your real Phase 5 database:** the log showed `migrationsApplied: [1,2]`, and booking J12 (SV-ALCW9Z) was intact afterwards, 108 sold.

## Verification (real output)

```
$ npx vitest run
 Test Files  5 passed (5)
      Tests  65 passed (65)     # +18 new in tests/hardening.test.ts, server tests updated

$ npm run build
dist/assets/index-BtLQdwYr.js   32.56 kB │ gzip:  11.24 kB
dist/assets/react-DgL-OIOw.js  394.24 kB │ gzip: 123.21 kB
dist/assets/three-Bz5O7RFL.js  787.97 kB │ gzip: 197.57 kB
✓ built in 287ms
```

**New tests:**
- config defaults, flags, and all-problems-at-once reporting
- migrations: fresh database, re-run does nothing, Phase 5 baseline keeps data, a failing migration rolls back and is not recorded
- idempotent confirm (one booking row only), expired-unconfirmed still returns 410, sweep count, offline-mock parity
- security headers; CORS allow and deny
- per-IP 429 with `Retry-After`, while another IP is unaffected
- form-encoded POST returns 415
- readiness 200, and 503 when the database is down
- gzip on stadium availability (more than 3× smaller)
- static caching headers and gzip; JSON 404; static mode without a build refuses to start

**Live production server** (`npm start`, http://127.0.0.1:3001):
- `/api/ready` → `{"ready":true}`. CSP and cache headers as above.
- The app renders under the CSP with **no console errors**.
- Customer B (curl) held J11 while the browser showed J11. **About 17 s later, without a reload,** the browser switched to "Held by another customer".
- A retried confirm returned the identical `SV-C3U8FT` both times.
- 60 hold requests in a minute succeeded (2 + 58); the next ones returned `429 … try again in 29 seconds`. `GET /api/events` was unaffected.
- `PORT=abc HOLD_MINUTES=0 ALLOWED_ORIGINS=tickets.example` → three problems listed, exit 1.

## Bugs hit and fixes used

1. **The static frontend returned 500** with `res.setHeader is not a function`. In @fastify/static v10, `setHeaders` receives a FastifyReply (checked in its `index.d.ts`). Fixed with `reply.header()`.
2. **A `tsc` type error** in the per-route rate-limit config (the helper returned two different shapes). Fixed with an explicit `FastifyContextConfig` return type.
3. **Stopping the dev API:** as in Phase 5, the npm task's Node child survived TaskStop. I identified the process on :3001 by its command line (this project's tsx server) and stopped only that one.

## Not done / not verified

- **Graceful shutdown on SIGTERM** is implemented (stop accepting connections, finish in-flight requests, close the database) but **not exercised**: Windows doesn't deliver POSIX signals to Node the same way, so Linux or containers need a check.
- **Real PostgreSQL** (`DATABASE_URL`), and the advisory lock under real concurrency, are still untested. The tests run on PGlite.
- **The 15 s refresh downloads full availability** (about 39 kB gzipped for the stadium) per open tab. Fine at demo scale. At high traffic, a version/ETag or push updates would cut that.
- **No Dockerfile or deployment config.** It couldn't be tested here (no Docker).
- **Test data:** booking SV-C3U8FT (K10) was added to `data/pglite` during these checks, alongside SV-ALCW9Z. Delete the folder to reset.

## Files changed in this phase

```
new   server/config.ts, server/migrate.ts, server/migrations/{001_init,002_booking_hold_id}.sql
new   tests/hardening.test.ts, docs/PHASE6_REPORT.md
moved server/schema.sql → server/migrations/001_init.sql
edit  server/app.ts (helmet, compress, cors, rate limit, schemas, ready, static), server/index.ts
      (config, migrations, sweeper, shutdown), server/pgBookingService.ts (idempotent confirm,
      sweepExpired, ping), server/db.ts
edit  src/booking/useBooking.ts (15 s refresh, error messages), src/booking/localService.ts (idempotent confirm)
edit  vite.config.ts (chunk groups), package.json (start script, plugins, tsx → dependencies)
edit  tests/server.test.ts, README.md, CREDITS.md
```

## Open questions

1. **Deployment target:** a VPS (systemd + nginx), a container platform, or something else? That decides the Dockerfile and proxy setup, and lets me test graceful shutdown on Linux.
2. **Still open from earlier phases:** contact details at checkout, real-Postgres testing, the project license, and the camera view width.
