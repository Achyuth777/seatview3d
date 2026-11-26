# SeatView 3D (private demo)

A browser extension that adds a **3D seat view** to cinema seat-selection pages. Turn the switch on, point at any seat on the site's own map, and a side panel shows the view from that seat, with the film's image on the screen. Booking and payment stay entirely on the site.

| Site | Status |
|---|---|
| **District** (district.in) | Works. Checked on real seat maps on 25 Nov 2026 (PVR Palazzo; Kamala Cinemas with couple seats). Film banner from District's cinema/film pages. |
| **PVR INOX** (pvrcinemas.com) | Works. Reader built from PVR Palazzo's real seat page (26 Nov 2026); tested on that real layout (12 rows, aisles, short front row). Poster comes from the seat page itself. PVR's site opens the seat page without reloading, and the switch follows it. A live run with the extension stopped at PVR's payment-notice pop-up, which needs "Accept" from you. |
| **BookMyShow** | Not yet. BookMyShow blocks automated browsers ("Sorry, you have been blocked"), and SeatView doesn't get around that. To add it, save a BookMyShow seat page from your own browser (Ctrl+S, "Webpage, HTML only") and the reader can be built from that file. |

Each site has a small reader in `src/extension/sites.ts`; the 3D hall, panel and figures are shared.

**Status: private demo.** It is not published to the Chrome Web Store and must not be, without District's written permission (see "Before going further").

## What it does

| Step | What happens |
|---|---|
| You open a cinema or film page on District | The extension remembers the film's banner image from the page's public schema data (`ScreeningEvent → Movie → image`). Nothing else is read. |
| You open a showtime's seat map | A "3D seat view" switch appears. Nothing else changes on the page. |
| You switch it on | A panel opens on the right. It rebuilds the hall from the seat map on the page: rows, seats, aisles and seat numbers. |
| You point at a seat | The panel flies to that seat and shows the view, plus how much of your view the screen fills, distance, off-centre angle and an overall grade. |
| You click a seat | District's own click works as normal. The panel keeps that seat as "Your seat". |

### Real vs estimated

- **Real (read from District's page):** row letters, seat count per row, aisles and gaps, seat numbers, taken seats, film name, show time and cinema.
- **Estimated (the page doesn't say):** seat spacing (0.55 m), row spacing (1.05 m), screen width (sized to the seating, 8–20 m), step heights, and screen shape (2.39:1, or 1.9:1 for IMAX). The panel says so on screen: *"Illustrative: real seat map, estimated sizes"*, and "How this view is made" lists every assumption.

## Install it (2 minutes)

1. Build it:
   ```powershell
   npm run build:extension
   ```
2. In Chrome go to `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and choose the `extension-dist` folder.
3. Open a cinema page on district.in (this lets it remember the film's banner), pick a showtime, and turn on **3D seat view**.

## Tests and the demo recording

- Unit tests (seat numbering, hall from a seat map): `npx vitest run tests/extension.test.ts`
- Browser tests against stand-in pages (no traffic to District): `npm run build:extension` then `npx playwright test e2e/extension.spec.ts --project=chromium-desktop`
- Demo recording on the real site, **look only** (opens pages and points at seats; never clicks a seat, books or signs in): `node scripts/record-district-demo.mjs`. Writes `demo.webm` and `live-*.png` here. These files are kept out of git because they show District's page and a film's artwork.

Recorded on 25 Nov 2026 (PVR Palazzo, Chennai, 8:00 PM show): the panel read 12 rows, loaded the film banner, and previewed seats A20, I18 and J9.

## Known limits

- Desktop browsers only. District's phone app can't run extensions; that needs District to build it in.
- If District changes its page markup, the switch simply doesn't appear (tested). The reader looks for row lists, row letters and "available" seat markers.
- Seats scrolled behind the panel are reached by scrolling District's map sideways.
- The banner appears only after you've visited a cinema or film page for that film in this browser.

## Before going further (pitch notes)

- **Don't publish it.** District's terms and brand belong to District. A public extension that changes their page and shows film artwork needs their written permission.
- **Who to contact:** District's partner page asks builders to tell them what they're building; developer contact: developers@district.in.
- **District's MCP connector** (studio.district.in/mcp) is described as for personal use, so it isn't a basis for a product.
- **The pitch:** "Your seat map is already the source of truth. This adds a 3D view from each seat on top of it, with no change to your booking flow. Built in, it could use your real hall measurements instead of estimates." Attach `demo.webm` and two screenshots.
- **What they'd gain built in:** real hall dimensions (no estimates), the official poster, and the phone app.
