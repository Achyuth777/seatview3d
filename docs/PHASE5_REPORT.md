# SeatView3D — Phase 5 Report (Backend)

Date: 2026-11-22.

## Stack decision (asked and answered this phase)

The approved plan was Node + TypeScript + Fastify + PostgreSQL in Docker. **Neither Docker nor PostgreSQL is installed on this machine.** I asked, and you chose **PGlite now, Postgres later**:

- Locally, the database is PGlite: real PostgreSQL compiled to WebAssembly, running inside Node (Apache-2.0, ~16k stars), stored in `data/pglite/`. Nothing is installed system-wide.
- Set `DATABASE_URL` and the same server and schema run on a real PostgreSQL server through `pg`.
- The PGlite path was verified this session. The `DATABASE_URL` path is written but **untested**, because no Postgres server is available here.

## What was built

- **`server/schema.sql`:** three tables.
  - `bookings`
  - `holds`, with an expiry column
  - `seat_claims`, with **PRIMARY KEY (event_id, seat_id)** and a CHECK that each claim belongs to exactly one hold *or* one booking. That key is what makes double-booking impossible at the database level.
- **`server/pgBookingService.ts`:** the same `BookingService` interface and error codes as the in-browser mock.
  - Holds insert claims with `INSERT … ON CONFLICT DO NOTHING RETURNING` inside a transaction. If any seat fails to insert, the request returns 409 with those seats and the whole transaction rolls back.
  - Expired holds are swept at the start of every operation; their claims are removed by cascade.
  - Confirm runs in one transaction: lock the hold, price the seats, insert the booking, turn the claims into booking claims, delete the hold.
  - Mock pre-sold seats are seeded once per event, from the same deterministic generator as the browser mock (`src/booking/mockSales.ts`).
- **`server/app.ts`:** Fastify REST API mirroring the interface, with JSON-schema body validation, a 16 kB body limit and typed error responses. The table of routes is in the README.
- **`server/db.ts`:** a small adapter over PGlite or a `pg` Pool.
- **Frontend:**
  - `HttpBookingService` implements `BookingService` over `fetch`, and the Vite dev server proxies `/api` to `:3001`.
  - The UI code is unchanged: only the service instance was swapped.
  - `npm run dev:offline` keeps the Phase 4 in-browser mock.
- **Shared code:**
  - The server imports the existing `src/booking` (types, catalog, pricing) and `src/engine` (venue layouts → valid seat IDs and prices) directly, so client and server can't disagree about seats or prices.
  - I split `venues.ts` (pure, server-safe) out of `venueData.ts` (browser-only).

## Verification (real output)

```
$ npx vitest run
 Test Files  4 passed (4)
      Tests  47 passed (47)      # 12 cinema + 13 stadium + 11 booking (mock) + 11 server (PGlite + HTTP)

$ npm run build                  # tsc now also type-checks server/
✓ built in 397ms
```

**Server integration tests** (in-memory PGlite, real SQL, through Fastify's `inject`):
- migrate and seed are idempotent
- the database itself rejects a duplicate seat claim (`duplicate key`)
- the event list
- hold → availability → confirm → sold, after which a second confirm returns 410
- updating a hold keeps its ID and expiry
- 409 lists exactly the conflicting seats, and the failed request leaves nothing claimed (rollback)
- **8 simultaneous holds on one seat → exactly one 201 and seven 409s**
- expiry frees the seat for someone else
- DELETE releases a hold
- validation: 400, 404 and 410 codes
- the stadium's 46k-seat inventory

**Full stack in the browser pane** (server on :3001, app on :5173):
1. `GET /api/health` → `{"ok":true}`. Log: `database: pglite (…\seatview3d\data\pglite)`. `/api/events` works through the Vite proxy.
2. Server availability: 107 sold. That matches the Phase 4 mock, because both use the shared generator.
3. **Customer B** (curl) held J13 + J14. **Customer A** (browser) opened J13 and saw **"Held by another customer"**. This state could not occur before the backend existed.
4. A added J12 to the cart. B then tried to add J12 → `HTTP 409 {"code":"SEAT_UNAVAILABLE","seatIds":["J12"]}`.
5. A: Checkout → Confirm → **SV-ALCW9Z**, €12.00.
6. Released B's hold (204). **Restarted the server** (old PID 9648 → new PID 9840) → J12 still sold, 108 sold in total (107 + 1), no duplicate seeding.
7. Mode check: the default build contains no reference to the mock's localStorage key; the `--mode offline` build does.

## Bugs hit and fixes used

1. **The first server start failed** with `ENOENT … mkdir data\pglite`: PGlite only creates the last folder in its path. Fix: `mkdirSync(dataDir, { recursive: true })` before opening.
2. **Test assumptions about Fastify validation.** Fastify's default validator strips unknown body fields (`removeAdditional`) and coerces a lone string into an array (`coerceTypes: 'array'`), so neither is rejected. I kept those defaults, documented them in the test, and test a real type error instead.
3. **The first "restart" check was invalid.** Stopping the background `npm run server` task left the Node child process running on Windows, so the check hit the old server. I caught this when the new start failed with `EADDRINUSE`. I then identified the process on :3001 as this project's tsx server, stopped it, started a fresh one and re-verified (step 6). In a normal terminal, Ctrl+C stops the server as expected.

## Notes

- **npm blocked esbuild's postinstall script** (`npm install-scripts`). tsx works without it, because the platform binary arrives as an optional dependency. I did not approve the script.
- **Test data in your local database:** `data/pglite/` now contains booking SV-ALCW9Z. Delete the folder to reset. The Phase 4 localStorage booking (SV-R4UN4T) only applies in offline mode.
- **Hold IDs are random UUIDs** and act as the capability to modify or confirm a hold. There are no user accounts.

## Files changed in this phase

```
new   server/{schema.sql,db.ts,pgBookingService.ts,app.ts,index.ts}
new   src/booking/{httpService,mockSales,venues}.ts, tests/server.test.ts, .env.offline
new   docs/PHASE5_REPORT.md
edit  src/booking/venueData.ts (service selection), src/booking/localService.ts (shared mock sales)
edit  package.json (server, dev:offline scripts; fastify, pg, pglite, tsx, @types/*)
edit  tsconfig.json (server/, node types), vite.config.ts (/api proxy), .gitignore (data/)
edit  README.md (run + API), CREDITS.md
```

## Open questions

1. **Real PostgreSQL:** install Postgres (or Docker) later so I can test the `DATABASE_URL` path and run the concurrency test on a real multi-connection server? With PGlite's single connection, transactions run one after another, so the "8 concurrent holds" test proves correct behaviour but not real parallel contention. On a real server, the primary key enforces the same guarantee.
2. **Contact details at checkout** (name and email): add them now that there is a database?
3. **Not built:** accounts, payments (the brief excludes paid services and API keys; a payment sandbox would need your go-ahead), admin tools for events and prices, rate limiting, deployment.
4. **The planned phases (research → demo → second venue → booking → backend) are all done.** What next? Options: the stadium additions from Phase 3 (roof, boards, other sports), production hardening, or deployment.
5. **Still open:** project license, and camera view width.
