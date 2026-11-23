# Credits

## Runtime dependencies (installed from npm, used unmodified)

| Package | License | Use |
|---------|---------|-----|
| [three](https://github.com/mrdoob/three.js) 0.187.0 | MIT | WebGL rendering |
| [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) 9.8.2 | MIT | React renderer for three.js |
| [camera-controls](https://github.com/yomotsu/camera-controls) 3.1.2 | MIT | Animated fly-to-seat camera (`setLookAt`) |
| [react / react-dom](https://github.com/facebook/react) 19.3.1 | MIT | UI |
| [fastify](https://github.com/fastify/fastify) 5.12.8 | MIT | Booking API server |
| [pg](https://github.com/brianc/node-postgres) 8.23.1 | MIT | PostgreSQL driver (when `DATABASE_URL` is set) |
| [@electric-sql/pglite](https://github.com/electric-sql/pglite) 0.5.17 | Apache-2.0 | Embedded PostgreSQL for local dev and tests |
| [tsx](https://github.com/privatenumber/tsx) 4.23.15 | MIT | Runs the TypeScript server |
| [@fastify/helmet](https://github.com/fastify/fastify-helmet) 13.2.0 | MIT | Security headers |
| [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit) 11.3.0 | MIT | Per-IP rate limiting |
| [@fastify/cors](https://github.com/fastify/fastify-cors) 11.4.3 | MIT | CORS (only when ALLOWED_ORIGINS is set) |
| [@fastify/compress](https://github.com/fastify/fastify-compress) 9.3.0 | MIT | gzip/brotli responses |
| [@fastify/static](https://github.com/fastify/fastify-static) 10.1.12 | MIT | Serving the built frontend |
| Big Shoulders, Martian Mono, Doto, Archivo via [Fontsource](https://github.com/fontsource/fontsource) 5.3.0 | OFL-1.1 | Self-hosted site fonts |

Their LICENSE files ship inside `node_modules/<package>/LICENSE`.

## Reference implementations (read, not copied)

No source code from other repositories has been copied into this project so far.
These were used only to cross-check our own formulas:

- [shanja-glinka/cinema-hall-kit](https://github.com/shanja-glinka/cinema-hall-kit) (0BSD): per-seat
  horizontal screen angle `atan2(W/2 − x, d) + atan2(W/2 + x, d)` in `packages/core/src/metrics.ts`.
- [whoistorres/stadium-seat-view](https://github.com/whoistorres/stadium-seat-view) (MIT): its
  approach of solving each riser from the Green Guide C-value formula with a rake cap confirmed ours.
  Our bowl (constant-offset rounded rectangle), solver and metrics were written independently.

If code is copied from either in a later phase, its LICENSE goes to `third_party/<repo>/LICENSE`
and the files are listed here.

## Standards and references

- Rolv Gjestland, *How to design a cinema auditorium*, 2nd ed., UNIC (International Union of
  Cinemas): viewing angles §4.1–4.4, sightline clearance §4.7, row distance §5.1.
- *Guide to Safety at Sports Grounds* (Green Guide), 5th ed., 2008: C-value formula
  (Diagram 12.1), 34° seated rake (§13.11), seat width / row depth (§12.13).
- FIFA Stadium Guidelines: 105 × 68 m pitch (§5.3); 150 m / 190 m viewing distances ("Stadium Bowl").
- IFAB Laws of the Game, Law 1: pitch markings and goal size (used from standard values; not fetched
  this session).
- NBA court dimensions (94 × 50 ft) [secondary: Wikipedia]; court markings, rim and backboard from
  commonly published NBA rulebook values (not fetched).
- ICC playing conditions, clause 19 (boundary 65–90 yd) [secondary]; 30-yard fielding circle and
  22-yard pitch from the MCC Laws/ICC conditions (standard values, not fetched).

## Container images (docker-compose.yml, not bundled)

- `node:24-bookworm-slim` (Node.js, MIT; Debian base) and `postgres:18` (PostgreSQL License).
- DCI / ISDCF aspect ratio registry: 2.39:1 Scope, 1.85:1 Flat.
