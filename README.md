# SeatView

**See the exact view from your seat before you pay.**

SeatView is a demo ticketing platform for movies, cricket, football and basketball. Pick a seat and a 3D camera moves to that seat's eye height, showing the view of the screen or field, with the seat's distances, angles and sightline clearance worked out from the venue's geometry.

![SeatView landing page](docs/screenshots/p9/desktop.png)

> **Demo project.** Not affiliated with any team, league, film or studio. Team and film names are used for recognition only, with no logos or posters. Fixtures, showtimes, venues and prices are fictional, and no payment is taken.

## Screens

| 3D seat view | Phone seat view | Checkout | Your tickets |
|---|---|---|---|
| ![Stadium seat view](docs/screenshots/p9/desktop-book.png) | ![Cinema seat view on a phone](docs/screenshots/p9/fit-phone-K12.png) | ![Checkout with a timed hold](docs/screenshots/p9/m-checkout.png) | ![Profile with a ticket](docs/screenshots/p9/m-profile-ticket.png) |

## Features

- **Four parametric venues**, generated from dimensions in metres: a 2.39:1 cinema, a two-tier football stadium, a basketball arena and an oval cricket ground.
- **True seat view:** the camera sits at a seated eye height of 1.15 m. Upright phones widen the view so every cinema seat shows the whole screen.
- **Measured seats:** each seat shows its viewing angles, distances and sightline clearance, graded against published guidance.
- **Full booking flow:** browse, filter by city and date, hold seats for 10 minutes, check out and get a booking reference.
- **Double-booking protection:** a PostgreSQL primary key allows one claim per seat, tested with parallel connections.
- **Local profile:** saved details and tickets with no account or password. A booking can only be looked up with its reference *and* email.
- **Production basics:** rate limiting, security headers, input validation, versioned migrations, health checks, and a single-process build.

## How the seat math works

| Venue | Model | Source |
|---|---|---|
| Cinema | Horizontal screen angle `θ = atan((W/2 − x)/d) + atan((W/2 + x)/d)`; step heights solved for clearance over the row in front | UNIC *How to design a cinema auditorium* |
| Stadium, arena, cricket | Sightline value `C = D(N + R)/(D + T) − R`; each riser solved for a target C, capped at a 34° rake | *Guide to Safety at Sports Grounds* (Green Guide), 5th ed. |
| Football distances | Optimum within 150 m and maximum 190 m of the far corner | FIFA Stadium Guidelines |

The demo venues are modelled to real-world dimensions but are not surveys of real buildings. Values chosen for the demo are marked `[assumed]` in [`src/engine`](src/engine).

## Tech stack

| Area | Tools |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| 3D | three.js, React Three Fiber, camera-controls |
| Backend | Node.js, Fastify |
| Database | PostgreSQL, or embedded PGlite with no setup |
| Tests | Vitest |
| Deployment | Dockerfile and Docker Compose |

## Getting started

Requires **Node.js 20.19+ or 22.12+** (developed on Node 24).

```bash
git clone https://github.com/Achyuth777/seatview3d.git
cd seatview3d
npm install
npm start
```

Open <http://127.0.0.1:3001>. This builds the app and serves it with the API from one process. With no database configured, it uses embedded PGlite and stores data in `data/pglite/`.

### Development

Run these in two terminals, then open <http://localhost:5173>:

```bash
npm run server
npm run dev
```

| Command | What it does |
|---|---|
| `npm start` | Build, then serve the app and API |
| `npm run server` | Run the booking API on port 3001 |
| `npm run dev` | Run the Vite dev server, proxying `/api` |
| `npm run dev:offline` | Run the frontend with an in-browser mock, no server |
| `npm run build` | Type-check and build for production |
| `npm test` | Run the unit and API tests |

### Use PostgreSQL

Create a database, then set `DATABASE_URL`:

```bash
# macOS / Linux
DATABASE_URL="postgres://USER:PASSWORD@127.0.0.1:5432/seatview" npm start
```

```powershell
# Windows PowerShell
$env:DATABASE_URL = "postgres://USER:PASSWORD@127.0.0.1:5432/seatview"
npm start
```

Tables are created automatically on first start.

To run the multi-connection tests too, set `TEST_DATABASE_URL` to a **throwaway** database. The tests wipe it on every run and refuse any database whose name doesn't end in `_test`.

### Docker

```bash
cp .env.example .env   # then set POSTGRES_PASSWORD
docker compose up -d --build
```

The Docker files have not been run end to end yet. Their runtime steps were rehearsed without Docker.

### Vercel

[`vercel.json`](vercel.json) deploys the frontend only, using the in-browser booking mode. Bookings are saved in each visitor's browser, so visitors don't share seat availability. For shared bookings, run the Fastify server with PostgreSQL.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3001` / `127.0.0.1` | Listen address |
| `DATABASE_URL` | none | PostgreSQL connection; unset uses PGlite |
| `DATA_DIR` | `./data/pglite` | PGlite storage |
| `HOLD_MINUTES` | `10` | Seat hold duration (1–60) |
| `RATE_LIMIT_MAX` | `300` | API requests per minute per IP |
| `RATE_LIMIT_HOLDS_MAX` | `60` | Hold, confirm and lookup requests per minute per IP |
| `ALLOWED_ORIGINS` | none | Exact origins allowed by CORS |
| `TRUST_PROXY` | `false` | Set to `true` only behind your own reverse proxy |
| `SERVE_STATIC` | `false` | Serve `dist/` (`npm start` enables it) |
| `SWEEP_INTERVAL_SECONDS` | `60` | Cleanup interval for expired holds |
| `LOG_LEVEL` | `info` | Server log level |

## API

| Method | Path | Result |
|---|---|---|
| `GET` | `/api/health`, `/api/ready` | Process and database status |
| `GET` | `/api/events` | Bookable sessions |
| `GET` | `/api/events/:eventId/availability` | Sold and held seats |
| `POST` | `/api/holds` | Create or update a hold |
| `DELETE` | `/api/holds/:holdId` | Release a hold |
| `POST` | `/api/holds/:holdId/confirm` | Confirm with `{ customer: { name, email } }` |
| `GET` | `/api/bookings/:reference?email=` | Find a booking by reference and email |

## Project structure

```text
src/
  engine/    Venue geometry and seat metrics (no 3D dependency)
  booking/   Catalog, pricing, booking services and state
  render/    three.js scenes and camera
  site/      Landing, listings, event, booking and profile pages
  ui/        Booking panels
server/      Fastify API, database access and migrations
tests/       Engine, booking, API and PostgreSQL tests
docs/        Phase reports and screenshots
```

## Project status

This is a working demo, not a live ticketing service. It has no payments, user accounts or email delivery. It has been tested in Chrome and Chrome's phone emulation, but not yet on physical phones or in Safari. From close stadium seats, the far ends of the pitch can fall outside the frame.

The design system is in [DESIGN.md](DESIGN.md), the product brief is in [PRODUCT.md](PRODUCT.md), and build notes are in [docs](docs).

## License

[MIT](LICENSE). Third-party libraries, fonts and references are listed in [CREDITS.md](CREDITS.md).
