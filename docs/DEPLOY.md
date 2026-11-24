# Deploying SeatView

One hosting path, kept deliberately small: **one container that serves both the site and the API**, a managed **PostgreSQL**, an **email provider**, and imports scheduled **inside the app**. It has not been deployed. No staging environment or credentials exist yet, so the steps below are a plan, not a record.

## Pieces

| Piece | Choice | Status |
|---|---|---|
| Frontend and API | The `Dockerfile` image (`server/index.ts --static`) on any container host, such as Render, Fly.io or Railway | Image builds from this repo. Docker has not been run on this machine. |
| PostgreSQL | Managed PostgreSQL 16 or newer from the same provider | Tested locally on PostgreSQL 18 |
| Email | A transactional email provider with SMTP or an API | **Blocked:** not connected. Only `MAILER=outbox` (simulated) exists. |
| Scheduled imports | Built-in timer, every `FEED_REFRESH_MINUTES`, when a provider is configured | **Blocked:** no licensed showtime provider |
| Static-only fallback | The current Vercel project (`vercel.json`, frontend-only build) | Live. No accounts or admin there. |

Why one container: the browser and the API share one origin, so the session cookie stays `SameSite=Lax`, with no cross-site CORS or cookie settings. Imports run in the same process, and a Postgres advisory lock already keeps migrations safe if several instances start together.

## Environment

The server validates everything at startup and exits with a list of every problem. In production (`NODE_ENV=production`, set by the image) it refuses development-only settings.

| Variable | Production value |
|---|---|
| `DATABASE_URL` | Required. Managed Postgres URL. |
| `APP_ORIGIN` | Required, `https://…`. Used in emailed links. |
| `ADMIN_MFA_REQUIRED` | On by default, and can't be turned off |
| `ALLOWED_ORIGINS` | Empty (same origin) |
| `TRUST_PROXY` | `true` behind the host's load balancer |
| `SESSION_HOURS` | Default 720 |
| `MAILER` | `outbox` until a provider is connected |
| `FEED_PROVIDER` | `none`, or `movieglu` with a licence |
| `DEV_OUTBOX`, `FEED_PROVIDER=fixture` | Refused in production |

## Rollout

1. CI must pass: type check, both unit suites, the migration check, the build and the browser smoke test.
2. Take a backup (`pg_dump -Fc`). The host's daily backups are a second copy.
3. Deploy the new image. On start it applies pending migrations in order, each in a transaction, under an advisory lock.
4. Wait for `/api/ready` to return 200. The image's health check uses it.
5. Smoke test: `/movies?city=chennai` lists cinemas, `/preview/demo-hall-chennai-1?seat=K12` shows a seat, `/admin` shows the sign-in.
6. Watch the logs for `request_failed` and `feed_sync_failed`.

## Rollback

- **Code:** redeploy the previous image. Every migration so far (`001`–`006`) is additive, so older code runs fine against the newer schema.
- **Data:** restore the backup taken in step 2 into a new database, then point `DATABASE_URL` at it. The drill below shows this works.
- **Future migrations** that drop or rename anything must ship in two releases: stop using the column first, then remove it. That keeps a code rollback possible.

## Backup restore drill

```bash
SOURCE_DATABASE_URL=postgres://…/seatview RESTORE_DATABASE_URL=postgres://…/seatview_restore_test node scripts/restore-drill.mjs
```

This dumps the source, restores it into the throwaway database (its name must end in `_test`), compares row counts table by table, and deletes the dump. **Last run, 2026-11-24:** 20 tables and 95,796 rows restored in 1.2 s with no mismatches, using the local `seatview` database as the source.

## Logs and reports

- **Logs:** JSON lines. Each request carries a `requestId`, which is also returned as `x-request-id`. Request logs contain only method, path (no query string) and status, never headers, cookies, bodies or client addresses.
- **Failed syncs:** logged as `feed_sync_failed` with the city, reason and next action. They show in `/admin#feeds` with the last success, latest failure and a Retry button.
- **Email failures:** listed in `/admin#mail` with the error and number of attempts. While email is simulated there are none to report.

## Staging

There is none yet. To create one, run the same image against a separate database. Its host name must include "staging", and it must use its own `APP_ORIGIN`. Then run `npx playwright test e2e/m2-discovery.spec.ts e2e/m3-seat-preview.spec.ts` with `E2E_BASE_URL` set to it.
