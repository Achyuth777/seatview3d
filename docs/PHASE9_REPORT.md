# SeatView3D — Phase 9 Report (Real frontend)

Date: 2026-11-23.

## Your decisions

India and ₹ INR; local profile with no passwords; dark and cinematic; pitch/portfolio demo; product name **SeatView**; promise "See the exact view from your seat before you pay"; visual direction **Reservation Chart**, based on the printed chart pasted on a train coach door.

The design is original. It does not copy District or any other app.

## What was built

| Route | Page |
|---|---|
| `/` | Landing: a working chart of upcoming events with search, a live seat preview that swaps by row, the sightline section and seat plan, and category links |
| `/movies`, `/cricket`, `/football`, `/basketball` | Listings with date filters (and language for films), following the city picker |
| `/event/:id` | Film or fixture: generated team-colour or title artwork, showtimes, fares, a real seat view |
| `/book/:eventId` | The 3D seat view, cart, 10-minute hold and checkout |
| `/profile` | Saved details, tickets, and "add a booking by reference" |

- **Catalog:** 8 real film titles; IPL, ISL and NBA team names; 21 sessions. Fixtures, showtimes, venues and prices are fictional. No logos, crests or posters. The footer says "Demo — not affiliated".
- **Booking lookup:** `GET /api/bookings/:reference?email=` needs both values. A wrong email and an unknown reference give the same response.
- **Direct links:** production mode serves the app for page URLs.
- **Old links:** `/?venue=…&seat=…` redirect to the new booking route.

## Bugs found and fixed

1. **Cinema screen stripes.** Phase 2 blamed the software renderer. The real cause was the room wall and the screen sharing one depth. Fixed in the geometry, along with the same clash on the floor.
2. **Readout covered the seat view,** especially on phones. It now shows three key numbers, with the rest behind "All measurements".
3. **Phone checkout** clipped its error and hid Confirm. It is now one full-height step with 44 px controls and 16 px inputs.
4. **The drawing labelled the screen's height as its width.** Corrected to "Screen 5.86 m high".
5. **Copy overclaimed "real" venues.** It now says demo venues are modelled to real-world dimensions.
6. **Headless screenshots' dark band** (open since Phase 2). Fixed by capturing through Chrome's DevTools protocol at exact viewport sizes.
7. **Windows filename clash** between `profile.ts` and `Profile.tsx`; the store is now `profileStore.ts`.

## Verification

```
PGlite:      Test Files 6 passed (6) · Tests 89 passed | 5 skipped (94)
PostgreSQL:  Test Files 6 passed (6) · Tests 94 passed (94)
Build:       succeeds
Design detector: no findings
```

**Real-browser flow at 390 px, on PostgreSQL, 15 of 15 checks:** landing, search, event page, 3D booking, seat readout, add to cart, checkout, invalid email refused, booking confirmed, ticket in profile, ticket survives reload, name kept, ticket reopens its seat, not-found page, no console errors.

**Sticky preview, measured:** on a phone, after scrolling and tapping row 7, it stays under the header and shows the basketball seat. On landscape phones it is deliberately not sticky.

**Independent design review:** three rounds, each ending in "fix". By the last round every finding was scored resolved except the sticky preview. I then fixed and measured that one, and made small contrast, tap-target and hover fixes from the documentation audit. **The reviewer did not re-score those, so there is no final "ship" verdict.**

## Not verified / known limits

- **Sticky offset at tablet width (761–1080 px):** set to match the header, but the test page did not scroll far enough at 900 × 1000 to show it stuck.
- **Upright phones (your decision: fit the whole screen):** landscape and desktop keep 60°. In portrait the camera widens up to 135° vertical so every cinema seat shows the full 14 m screen (tested for all 336 seats on four phone shapes). Across, it stops at the 91.5° a 16:9 screen shows, so from close stadium seats the far ends of the pitch can still fall outside the frame, as they do on desktop. Wider views look smaller and stretch slightly at the top and bottom.
- **Real phones and browsers:** tested in Chrome's phone emulation only.
- **Docker** is still not run.
- **Small design debt:** grade badge colours sit outside the palette, and the booking-panel and site button styles are still two parallel sets (recorded in the audit; no effect on function).
- **Test data:** the browser checks added demo bookings for "Demo Tester" to your `seatview` database.
