# SeatView3D — Phase 4 Report (Booking flow, no backend)

Date: 2026-11-22.

## What was built

The booking flow for both venues, running entirely in the browser behind a service interface that the backend phase will implement.

- **`BookingService` interface** (`src/booking/types.ts`): `getAvailability`, `hold`, `release`, `confirm`. All methods are async, so swapping in an HTTP client later changes no UI code.
- **`LocalBookingService`** (`src/booking/localService.ts`) simulates the server:
  - **Mock sales:** about 35% of seats pre-sold per event [assumed], seeded deterministically from the event ID, so they are the same on every load.
  - **Holds:** 10-minute expiry [assumed]. The timer starts with the first seat and is not extended by adding more.
  - **Limits:** at most 10 seats per booking [assumed].
  - **Conflicts:** seats that are sold, held by another hold, or unknown are rejected with typed `BookingError` codes.
  - **Confirm:** creates a booking with reference `SV-XXXXXX` and a total in minor units (cents), and marks the seats sold.
  - **Persistence:** confirmed bookings go to `localStorage` (wrapped in try/catch; falls back to memory).
- **Mock event catalog** (`catalog.ts`): two cinema showtimes and one football match, with generic titles.
- **Price categories** (`pricing.ts`), all prices [assumed]:
  - Cinema: Front A–C €9, Standard D–K €12, Premium L–O €15.
  - Stadium: Cat 1 lower sides €120, Cat 2 lower ends/corners €80, Cat 3 upper sides €60, Cat 4 upper ends/corners €40.
- **UI:**
  - event picker next to the venue buttons
  - seat colours in both 3D scenes: grey sold, green in cart, amber held by others, yellow viewing
  - in the seat readout: category, price and Add/Remove (or a Sold / Held tag)
  - cart panel: seats (click to fly to a seat's view), total, hold countdown (red under 1 min), Checkout → Confirm → booking reference
  - switching event or venue releases the hold

## Verification (real output)

```
$ npx vitest run
 Test Files  3 passed (3)
      Tests  36 passed (36)      # 12 cinema + 13 stadium + 11 booking

$ npm run build
✓ built in 365ms
```

**Booking tests:**
- pricing per row, per tier and per segment, with totals in cents
- deterministic seeded sales (between 20% and 50%)
- a hold blocks other customers but not the holder
- sold and unknown seats are rejected
- 11 seats are rejected
- updating a hold keeps its ID and expiry
- at expiry the seats free up, and confirm or update fail with `HOLD_EXPIRED`
- confirm prices correctly, sells the seats and persists them to a fresh instance, for that event only
- release frees the seats

**End-to-end in the browser pane** (real clicks on the local dev server):
1. Cinema 19:00: 107 of 336 seats pre-sold. Opened J12, clicked **Add to cart** → cart "J12 · Standard · €12.00", timer "9:56".
2. Clicked a seat in the 3D overview → J23, shown as **Sold** with no Add button. Clicked another → G23 → **Add to cart** → "2 seats · €24.00". The timer kept counting (9:24), not reset.
3. **Checkout** → **Confirm booking** → "Booking confirmed **SV-R4UN4T**", total €24.00. localStorage holds `{ref: SV-R4UN4T, eventId: cin-1900, seats: [J12, G23], total: 2400}`. J12 and G23 now show as sold.
4. Reloaded `?seat=J12` → still **Sold** (persistence works).
5. Stadium match: 16,241 of 46,268 seats pre-sold. 103-17-35 is sold; 103-17-2 → **Add to cart** → "Cat 1: lower tier, sides · €120.00", timer 9:57.
6. Switched to Cinema and back → cart empty, 103-17-2 available again (hold released).

These runs left one demo booking (SV-R4UN4T) in the browser pane's localStorage. Clear `seatview3d.bookings.v1` to reset.

No new screenshot files this phase. The booking UI is HTML panels, and the headless capture used earlier cannot click, so the steps above were verified live in the browser pane instead.

## Files changed in this phase

```
new   src/booking/{types,catalog,pricing,localService,useBooking,venueData}.ts
new   src/ui/{CartPanel,SeatActions}.tsx, src/render/seatColors.ts
new   tests/booking.test.ts, docs/PHASE4_REPORT.md
edit  src/render/{CinemaScene,StadiumScene}.tsx   (colour by seat state)
edit  src/ui/{Readout,StadiumReadout}.tsx         (actions slot)
edit  src/App.tsx (event picker, shared selection, cart), src/style.css, README.md
```

## Limits of a backend-less demo (handled in the backend phase)

- Holds live in one browser tab's memory, so **two real users cannot see each other's holds** yet. The "held by another customer" state is fully implemented and tested, but in practice only a server can produce it.
- Bookings are stored per browser, and anyone can clear them. There are no accounts, no contact details and no payment.
- The pre-sold seats are a mock.

## Open questions

1. **Backend stack** for the next phase. Proposal: Node + TypeScript (Fastify) + PostgreSQL, reusing `src/booking/types.ts` and `src/engine` on the server.
   - Seats, holds and bookings tables.
   - Holds made atomic with a unique constraint on (event, seat) plus an expiry sweep.
   - REST endpoints mirroring `BookingService`.
   - Postgres could run locally via Docker, with no paid services. OK, or do you prefer something else?
2. **Business rules:** confirm the 10-minute hold, 10-seat cap and demo prices. Add a "no single-seat gaps" rule?
3. **Contact details at checkout** (name and email) are not collected yet. Add them in the backend phase, when there is somewhere to store them?
4. Still open from earlier phases: project license, and camera view width.
