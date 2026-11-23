# SeatView: Phase 10 Report (Cinema discovery)

Date: 2026-11-23. Branch: `feat/cinema-discovery`. Not deployed.

## Data status

| City | Verified cinemas | Live showtimes | Action shown |
|---|---:|---|---|
| Chennai | 3 | No | Provider link |
| Hyderabad | 3 | No | Provider link |
| Mumbai | 3 | No | Provider link |
| Bengaluru | 3 | No | Provider link |
| Kochi | 3 | No | Provider link |

Cinemas and links were checked on 2026-11-23 against District's public city listings. This confirms the venue exists, not its schedule or screen geometry. No real auditorium has a verified 3D layout.

MovieGlu documents India coverage and cinema-level showtimes, but its evaluation licence forbids publishing the data. The adapter is written and tested against the documented response shape only. It has not received a real response.

## Bugs fixed

1. Repeated showtime rows are now grouped by cinema and film, with one record per showtime.
2. Date and language choices now depend on the city and on each other. Impossible choices are omitted.
3. "Screen 1, Chennai" is replaced by real cinema names and neighbourhoods.
4. The same stale-date bug on the sports listings is fixed, and an empty city offers a one-click reset.
5. Seat previews now state their provenance before a seat is chosen.
6. Browser caching could hide a fresh refresh or outage notice. Discovery responses are no longer cached.

## Correction pass

**Root cause of the conflicting messages.** The process on `127.0.0.1:3001` started at 09:40, before the Phase 10 API existed, but served the rebuilt frontend from `dist`. `/api/discovery` and `/api/me` returned 404. Discovery reported an outage, while Profile treated the same failure as a deployment with no server.

The app now uses one distinction:

| State | How it is decided | What the visitor sees |
|---|---|---|
| Frontend-only | Build setting (`VITE_BOOKING=local`) | Directory, and "this version runs without a server" |
| Backend connected, no feed | Backend answers and has no successful import | Directory, sign-in and server lookup |
| Backend unavailable | Network failure, bad response or missing API route | Temporary warning, saved directory, Try again |
| Feed stale | Backend answers, latest import failed | Last good times with their timestamp |

Other corrections:

- Sample dates and languages now sit inside Sample schedule when there are no live showtimes.
- When a list spans several dates, a visible local date appears above each group of times. Each time keeps its full accessible label and its own link.
- In frontend-only mode, booking lookup reads only this browser's stored tickets, and the form says so.
- During a backend failure, lookup is replaced by an explanation and Try again. Saved tickets stay listed and no longer offer Remove.
- The navigation link and page title now use "Profile".

## Checks run

All results below were rerun after the correction pass.

| Mode | What ran | Result |
|---|---|---|
| None (unit and API) | Vitest on PGlite | 111 passed, 5 skipped |
| None (unit and API) | Vitest on a throwaway PostgreSQL database | 116 passed |
| Frontend-only | Real Chrome at 320, 390 and 1440 px: directory, visible dates, Forum Mall, VR Mall, Profile name, device-only lookup | 50 passed |
| Backend connected, no feed | Real server on throwaway PGlite, same three widths, plus sign-in form and server lookup | 46 passed |
| Real connection failure | Server process killed mid-session, then restarted | 12 passed |
| API unreachable at page load | Browser connections to `/api` dropped | 3 passed |
| Stale server on `:3001` | Read-only pages against the running old process | 3 passed |
| Backend with fake feed | Full Phase 10 flow: accounts, admin, outage, changed shows, sports, keyboard | 120 passed |

The first-admin command was run in the previous pass and was not rerun, because this pass did not change it. Feed success, outage and change handling use a fake provider.

## Design restoration

The dark auditorium palette was removed at the owner's request. Every page now uses the Reservation Chart system in `DESIGN.md`. `/` is the chart landing page again, and `/movies` is cinema discovery.

The landing page keeps the seat proof, sightline drawing and category rail. It now labels its schedule and seat proof as demo content, searches real cinemas, and has a city-by-city cinema section and a link back to Profile.

Rerun after the restoration:

| Mode | What ran | Result |
|---|---|---|
| None (unit and API) | Vitest on PGlite | 111 passed, 5 skipped |
| None (unit and API) | Vitest on a throwaway PostgreSQL database | 116 passed |
| Frontend-only | Landing and theme at 320, 390, 820 and 1440 px | 97 passed |
| Backend connected, no feed | Landing and theme at the same widths | 97 passed |
| Frontend-only | Directory, dates and device-only lookup | 50 passed |
| Backend connected, no feed | Directory, sign-in and server lookup | 46 passed |
| Real connection failure | Server killed mid-session, then restarted | 12 passed |
| API unreachable at page load | Browser connections to `/api` dropped | 3 passed |
| Backend with fake feed | Accounts, admin, outage, changed shows, sports, keyboard | 120 passed |

The earlier stale-server checks no longer apply, because `:3001` now runs the current server.

## Not verified

- A real MovieGlu response, or any live showtime.
- Physical phones and Safari.
- Docker.
- Email reminders: the opt-in is saved, but no email is sent.
- Sign-in, saved shows and admin actions on your `seatview` database. The server on `:3001` was restarted on the new code and migration 004 was applied there. Discovery, Profile and existing demo tickets were checked afterwards. Bookings (39) and seat claims (95,649) were unchanged.

## Setup still required

- A commercial showtime licence and credentials.
- Hosting for the Fastify server and PostgreSQL. Vercel currently serves the frontend only, so accounts and admin are off there.
- Email verification and password reset before real public sign-ups. Without verification, an account's email is unproven.
- Measured auditorium data before any layout is marked verified.
