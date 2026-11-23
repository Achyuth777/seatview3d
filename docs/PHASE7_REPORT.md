# SeatView3D — Phase 7 Report (Real PostgreSQL)

Date: 2026-11-22.

## Setup (done by you, with my instructions)

- **PostgreSQL 18.7** installed with winget; it runs as the Windows service `postgresql-x64-18` on port 5432.
- The installer set no admin password you knew, so we reset it:
  1. Allowed password-free local connections temporarily.
  2. Ran `ALTER USER`, and created the `seatview` login plus the `seatview` and `seatview_test` databases.
  3. Restored password checking.
  The restart in steps 1 and 3 failed because the terminal wasn't running as Administrator. The log confirms that password checking (`scram-sha-256`) was never switched off.
- You later set your own `seatview` password in pgAdmin. It was used only in shell environment variables for the test runs and the app; it is not in any project file, and the server log contains no occurrences of it (checked).

## What changed in the code

- **`tests/testDb.ts`:** the database tests run on in-memory PGlite by default, or on real Postgres when `TEST_DATABASE_URL` is set.
  - On Postgres, each fresh database means dropping and recreating the `public` schema.
  - **Guard:** the tests refuse to run unless the database name ends in `_test`, so the real `seatview` database can't be wiped by accident.
- **`tests/postgres.test.ts`:** 5 new tests that need several real connections (skipped on PGlite, which has a single connection).
- **`vitest.config.ts`:** with Postgres, test files run one after another, because they share one database.
- **`server/migrate.ts`:** creating the `schema_migrations` table now happens under the same advisory lock. Concurrent `CREATE TABLE IF NOT EXISTS` can collide in PostgreSQL's catalog when several servers start together.
  - This was a preventive fix based on known PostgreSQL behaviour. I didn't reproduce the collision on the old code first.
- **Tests:** cleanup no longer crashes with a second error when the connection itself fails.
- **README:** a new section on using and testing a real Postgres server.

## Verification (real output)

**Full suite on PostgreSQL 18** (`TEST_DATABASE_URL` → `seatview_test`):
```
 Test Files  6 passed (6)
      Tests  71 passed (71)
```

**Postgres-only tests**, with timings:
```
✓ refuses databases whose name does not end in _test                               3ms
✓ 40 customers on 8 connection pools race for one seat: exactly one wins          301ms
✓ overlapping multi-seat requests are all-or-nothing and never double-claim        32ms
✓ the same hold confirmed from 8 connections at once yields one booking            18ms
✓ a seat held on one connection is visible as held on another                       7ms
✓ two servers starting at once: each migration applied exactly once, no errors    148ms
```

**On PGlite** (default `npm test`): 66 passed, 5 skipped (the Postgres-only tests).

**The app on Postgres** (`DATABASE_URL` → `seatview`, `tsx server/index.ts --static`):
- Log: `"database":"postgres"`, `migrationsApplied: [1,2]` (fresh database), `serveStatic: true`. `/api/ready` → ready.
- Mock sales seeded: 107 sold for the cinema, 16,241 for the stadium.
- In the browser: stadium seat 103-17-2 → Add to cart → Checkout → Confirm → **SV-NLXTP6**, €120.00.
- Queried directly with `psql`: the row `SV-NLXTP6 | sta-match | 12000 | EUR | has_hold_id=t | 103-17-2`; `schema_migrations` = 1 init, 2 booking_hold_id; 0 open holds.

## Bugs and issues hit

1. **The first Postgres test run was rejected** (`password authentication failed for user "seatview"`). The log showed the account had a password, just not the placeholder (it had been changed in pgAdmin). I stopped instead of trying other passwords and asked you for it.
2. That failed run also showed that test cleanup crashed on undefined connections. Fixed.

## Current state

- **Running on :3001:** the production server, on your `seatview` Postgres database. It contains one test booking, SV-NLXTP6.
- **`seatview_test`:** wiped by each test run, so it currently holds leftover test data.
- **The old PGlite data** in `data/pglite/` (bookings SV-ALCW9Z and SV-C3U8FT) is untouched and no longer in use while `DATABASE_URL` is set.

## Not done

- **No deployment config.** Still waiting on your choice of deployment target. Clean shutdown on stop signals is still unverified on Linux.
- **Load testing** beyond 40 concurrent requests.
- **Still open:** contact details at checkout, the project license, and the camera view width.
