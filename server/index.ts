import { priceFor, seatIdsFor } from '../src/booking/venues';
import { buildApp } from './app';
import { ConfigError, loadConfig } from './config';
import { openPglite, openPostgres } from './db';
import { migrate } from './migrate';
import { PgBookingService } from './pgBookingService';

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

const app = buildApp(service, {
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

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    clearInterval(sweeper);
    app.log.info(`${sig}: shutting down`);
    await app.close(); // stops accepting, finishes in-flight requests
    await db.close();
    process.exit(0);
  });
}
