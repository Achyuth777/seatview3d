import { priceFor, seatIdsFor } from '../src/booking/venues';
import { buildApp } from './app';
import { ConfigError, loadConfig } from './config';
import { openPglite, openPostgres } from './db';
import { migrate } from './migrate';
import { PgBookingService } from './pgBookingService';
import { CITIES } from '../src/discovery/directory';
import { Accounts } from './platform/accounts';
import { CatalogStore } from './platform/catalogStore';
import { fixtureProvider, movieGluProvider } from './platform/feeds';
import { OutboxMailer } from './platform/mailer';

/** Starts the booking API (and, with --static / SERVE_STATIC=true, the built frontend). See server/config.ts. */
let config;
try {
  config = loadConfig();
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

const db = config.databaseUrl ? await openPostgres(config.databaseUrl) : await openPglite(config.dataDir);
const applied = await migrate(db);

const service = new PgBookingService(db, { seatIdsFor, priceFor, holdMs: config.holdMinutes * 60_000 });
const seedReport = await service.seedMockSales();

const feed = config.feedProvider === 'movieglu' ? movieGluProvider(config.movieGlu!)
  : config.feedProvider === 'fixture' ? fixtureProvider(config.feedFixtureFile!) : null;
const catalog = new CatalogStore(db, feed, undefined, { cacheHours: config.feedCacheHours });
await catalog.syncDirectory();
const accounts = new Accounts(db, catalog, service, undefined, { mailer: new OutboxMailer(db), appOrigin: config.appOrigin, sessionHours: config.sessionHours });

const app = buildApp(service, {
  platform: { catalog, accounts, feedProviderId: feed?.id ?? null, devOutbox: config.devOutbox, catalogDb: db, adminMfaRequired: config.adminMfaRequired },
  logger: { level: config.logLevel },
  rateLimit: { max: config.rateLimitMax, holdsMax: config.rateLimitHoldsMax },
  allowedOrigins: config.allowedOrigins,
  trustProxy: config.trustProxy,
  ready: () => service.ping(),
  staticDir: config.serveStatic ? config.staticDir : undefined,
});

await app.listen({ port: config.port, host: config.host });
app.log.info(
  {
    database: db.kind === 'pglite' ? `pglite (${config.dataDir})` : 'postgres',
    migrationsApplied: applied,
    serveStatic: config.serveStatic,
    allowedOrigins: config.allowedOrigins,
    mockSalesReseeded: seedReport.filter((r) => r.reseeded).map((r) => r.eventId),
  },
  'booking API ready',
);

for (const r of seedReport.filter((x) => x.orphanedRealClaims > 0)) {
  app.log.warn({ eventId: r.eventId, orphanedRealClaims: r.orphanedRealClaims }, 'real bookings/holds reference seat ids that no longer exist in the venue layout');
}

// Expired holds are also swept lazily on every request; this keeps the table small when idle.
const sweeper = setInterval(async () => {
  try {
    const n = await service.sweepExpired();
    if (n > 0) app.log.info({ expiredHolds: n }, 'swept expired holds');
  } catch (err) {
    app.log.error(err, 'hold sweep failed');
  }
}, config.sweepIntervalMs);
sweeper.unref();

// Showtime refresh runs only when a licensed provider is configured.
const feedTimer = feed
  ? setInterval(async () => {
      for (const c of CITIES) {
        try {
          const r = await catalog.refresh(c.id);
          if (r.status === 'failed') app.log.warn({ city: c.id, message: r.message }, 'showtime refresh failed; keeping cached results');
        } catch (err) {
          app.log.error(err, 'showtime refresh crashed');
        }
      }
    }, config.feedRefreshMinutes * 60_000)
  : null;
feedTimer?.unref();

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    clearInterval(sweeper);
    if (feedTimer) clearInterval(feedTimer);
    app.log.info(`${sig}: shutting down`);
    await app.close(); // stops accepting, finishes in-flight requests
    await db.close();
    process.exit(0);
  });
}
