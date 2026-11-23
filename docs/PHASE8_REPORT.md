# SeatView3D — Phase 8 Report (Deployment, checkout details, stadium additions, loose ends)

Date: 2026-11-22. You asked for all four remaining items.

Your decisions:
- **Docker** for deployment
- **MIT** license
- **all four** stadium additions (roof, advertising boards, overhanging upper tier, NBA and cricket presets)
- camera view width stays at **60°**

Checkout details, which you didn't specify: **name + email, both required**.

## 1. Loose ends

- `LICENSE` (MIT, "SeatView3D contributors"; change the holder name if you like) and `"license": "MIT"` in `package.json`.
- The 60° vertical FOV (about 91° horizontal at 16:9) is recorded as your decision in `src/App.tsx`.

## 2. Checkout details (name + email)

- **Shared validation** (`src/booking/customer.ts`), used by the browser form, the in-browser mock service and the server:
  - names are trimmed and their spaces collapsed; 1–100 characters; control characters rejected
  - emails are trimmed and lowercased; must be a simple address; at most 254 characters
  - errors use code `INVALID_CUSTOMER` (HTTP 400) and list every problem
- **API:** `POST /api/holds/:id/confirm` now requires `{customer: {name, email}}`. Retrying a confirm still returns the original booking.
- **Migration 003:**
  - adds `customer_name` and `customer_email`
  - adds a CHECK requiring them on new real bookings, created `NOT VALID` so bookings made before the change (and the mock sales) stay legal
  - verified on your Postgres: the earlier booking SV-NLXTP6 kept no contact details, and `convalidated = f` as intended
- **UI:** the checkout step now has Name and Email fields, with the note *"Used only for this booking; no emails are sent."* Invalid details keep you on the checkout step. The confirmation shows "For <name> · <email>".
- **Privacy:** availability responses never include customer data (tested), and contact details aren't logged.

## 3. Docker (written; checked as far as possible without Docker)

- **`Dockerfile`:**
  - two stages on `node:24-bookworm-slim`, building the app and then running `npm ci --omit=dev`
  - runs as the unprivileged `node` user, `HOST=0.0.0.0`, static serving on
  - `HEALTHCHECK` on `/api/ready`, using Node's `fetch`, so no curl is needed in the image
- **`docker-compose.yml`:**
  - `postgres:18`, with a `pg_isready` health check and a volume at `/var/lib/postgresql` (the mount point for the 18 image)
  - the database is not published to the host
  - the app waits for a healthy database; `init: true` (tini) forwards SIGTERM for graceful shutdown; `stop_grace_period: 20s`
- `.env.example` (`POSTGRES_PASSWORD` required; compose refuses to start without it), `.dockerignore`, and `.env` added to `.gitignore`.
- **What I could verify** (Docker and WSL aren't installed here):
  - I **rehearsed the runtime stage**: a clean folder with exactly what the image copies, plus `npm ci --omit=dev` (no Vite, tsx present).
  - Started with the container's command and environment: migrations `[1,2,3]` applied, the app served (200, `text/html`), `/api/ready` returned `{"ready":true}`, and **the HEALTHCHECK command returned exit code 0**.
  - **Not verified:** `docker build`, the compose file (no YAML parser here, only a tab check), the Linux esbuild binary, and SIGTERM handling inside the container.

## 4. Stadium additions

All of these are parametric and analytic, with grades shown in the seat readout.

- **Boundary shape:** the bowl engine now offsets a *rounded* rectangle (corner radius r0). Football and basketball use r0 = 0; the cricket oval uses an inner 10 × 0 m rectangle with r0 = 68 m. Every row stays exactly a constant distance from the boundary, so focal distances stay exact (tested).
- **Advertising boards** (football: 0.9 m tall, 5 m from the touchline; cricket: 3 m behind the rope) [assumed]. The front row's C value is now measured over the boards instead of showing "—". Football row 1: **372 mm** (hand-checked: 2.2 × 5/8.65 − 0.9).
- **Roof** (football: front edge 16 m from the touchline at 27 m high; cricket: over the upper tier) [assumed]. It's checked to be at least 2.5 m above every covered seat.
  - The readout shows **"Covered"** and **"Sees up to X m above the centre spot"**: the highest point visible under the roof edge, hand-checked in a test.
  - This one is informational; I found no sourced threshold.
- **Overhanging upper tier:** a negative `setback` cantilevers the tier over the one below.
  - Its underside must leave 2.5 m of headroom above every covered row [assumed], and the tier is raised automatically to achieve that.
  - Lower rows under the overhang show "Covered (upper tier above)", "Headroom" and their capped view height.
- **Tier front balustrade:** an upper tier's first row now has its C value measured over its own balcony front (and over the tier below, if that's in front).
- **NBA arena and cricket ground**, each a selectable venue with its own event and prices:
  - Basketball: NBA court markings, hoops, indoor background.
  - Cricket: oval outfield, 30-yard circle, 22-yard pitch with creases. Price categories are "square of the wicket" vs "behind the bowler".
  - The FIFA distance grade applies to football only; for the others, the farthest distance is shown without a grade.

### Design findings (from the engine, while choosing demo parameters)

My first-guess parameters produced badly designed venues, and the engine flagged them. Rather than hide anything, I measured the options. Each finding is locked in by a test:

| Variant | Upper row 1 C | Worst upper C | Unacceptable seats |
|---|---|---|---|
| Football, 4 m overhang, solid 0.8 m front | 16 mm | 36 mm | 21,840 / 44,748 |
| Football, no overhang, solid 0.8 m front | 81 mm | 90 mm | 0 |
| **Football, 1.5 m overhang, 0.5 m opaque front (shipped)** | **351 mm** | **65 mm** | **0** |
| Arena, 2 m overhang, solid 0.8 m front | −154 mm | −145 mm | 6,490 / 11,504 |
| **Arena, 12 + 10 rows, 5 m from the court, no overhang, 0.5 m front (shipped)** | **381 mm** | **60 mm** | **0** |
| Cricket, front row at 0.8 m | — | — | 972 (row 1 sees 0 mm over the boards) |
| **Cricket, front row at 1.3 m, 0.5 m front (shipped)** | **339 mm** | **60 mm** | **0** |

- **A large overhang pulls the tier closer and higher.** Its back rows would then need more than the 34° maximum rake, so C collapses. The solver correctly stops at 34° and reports the lower C.
- **A solid 0.8 m balcony front almost hides the near touchline** from the first row of a steep upper tier.
- **My first fix idea, a front gangway, made it worse** (16 → −567 mm). When you're looking steeply down, moving back from the edge lowers your sightline where it passes the balustrade. `frontGangway` stays as valid geometry for walkways, and a test records this.
- **Tight arenas:** next to a 28.65 m court, the 34° cap binds quickly, so the arena demo uses short tiers and the 60 mm minimum target.

### Production issue found and fixed: seat IDs change when a layout changes

The Postgres database already had pre-sold mock claims seeded from the *old* football and arena layouts, so new seat IDs wouldn't have matched.

- At startup, the server now **re-syncs mock sales per event**: if they no longer match the current layout, only the mock claims are replaced. Real bookings and holds are never touched.
- It logs a warning for any real booking whose seat no longer exists.
- On your Postgres, the restart log showed `mockSalesReseeded: ["sta-match","arena-game"]`. Cricket was correctly left alone: raising its front row changed no seat IDs. There were no orphaned bookings, and SV-NLXTP6's seat 103-17-2 is still valid.

## Verification (real output)

```
$ npx vitest run                         # PGlite
 Test Files  6 passed (6)
      Tests  85 passed | 5 skipped (90)

$ TEST_DATABASE_URL=…/seatview_test npx vitest run   # PostgreSQL 18
 Test Files  6 passed (6)
      Tests  90 passed (90)

$ npm run build
✓ built in 317ms
```

**New tests (+19 since Phase 7):**
- customer validation and normalisation, through the API and stored in the database
- availability contains no customer data
- the boards clearance hand calculation
- overhang headroom
- the balustrade clearance formula
- the roof "sees up to" hand calculation
- the lower tier capped by the overhang
- the arena: NBA dimensions, no FIFA grade
- cricket: ICC boundary range and constant offset from the rope
- every seat of every venue has a valid price category
- the cricket category split
- the four design-finding tests
- "the shipped demo has no unacceptable seats"
- mock-sales re-sync

**Live on Postgres (production server on :3001):**
- Migration 3 applied to existing data; mock sales re-synced as above. The password doesn't appear in the log (0 matches).
- Checkout through the API:
  - invalid details → `400 INVALID_CUSTOMER` listing both problems; missing body → 400
  - valid details → **SV-9F9F6K**, seat 103-6-3, €150.00, with the name and email normalised
  - the database row has `Demo Tester | demo.tester@example.com`
- Screenshots (`docs/screenshots/`, headless Chrome 1600×900):
  - `p8-football-overview` (roof, boards, two tiers)
  - `p8-football-under-overhang-104-25-1` (covered, sees up to 70.6 m, headroom 2.50 m)
  - `p8-football-upper-front-204-1-1` (351 mm over the balustrade)
  - `p8-arena-overview`, `p8-arena-103-6-1`
  - `p8-cricket-overview`, `p8-cricket-212-14-1` (under the roof)

## Bugs hit and fixes used

1. **Cricket outfield striping** (depth-fighting: two ground layers 1 cm apart, seen from about 200 m). Fixed by spacing the layers further apart (−0.12 / 0 / +0.03…0.07 m).
2. **My first attempt at that fix didn't apply:** the search text no longer matched after `PlayingSurface` moved and was re-indented. I re-applied it by line number and re-captured the screenshot.
3. **`PlayingSurface` was first defined inside the scene component**, which would have rebuilt its texture on every seat click. Moved it to the top level.
4. **Test assumptions:** an argument-order slip (`sampleLoop`), boundary sampling in the cricket test, and the catalog test still listing three events. All fixed. Separately, the "every row meets target C" test now excludes tier-first rows, which are set by lift and headroom, not C.
5. **One of my shell commands hung** on a stray `cat >` waiting for input. Stopped it and re-ran the script on its own.

## Not done / not verified

- **Docker build and run.** Docker isn't installed here, and neither is WSL.
- **The checkout form wasn't click-tested this phase.** You were using the browser pane, so I tested through the API it calls instead. The form's validation uses the same shared function.
- **Demo parameters marked [assumed]** (boards, roof, headroom, balustrade height, arena and cricket tiers) are engineering choices, not standards.
- **Basketball and cricket markings** use standard values I didn't fetch this session.

## Current state

- **Production server** on :3001, on your `seatview` Postgres database, with test bookings SV-NLXTP6 (no contact) and SV-9F9F6K (Demo Tester).
- **Your browser pane:** may still hold an arena seat in the cart from my interrupted click; its hold expires within 10 minutes.
