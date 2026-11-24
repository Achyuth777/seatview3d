import { loadMigrations as loadAllMigrations } from '../server/migrate';
/** Every migration in server/migrations, so adding one never needs a test edit. */
const ALL_VERSIONS = loadAllMigrations().map((m) => m.version);
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockSoldSeats } from '../src/booking/mockSales';
import { LocalBookingService } from '../src/booking/localService';
import { priceFor, seatIdsFor } from '../src/booking/venues';
import { buildApp } from '../server/app';
import { ConfigError, loadConfig } from '../server/config';
import type { Db } from '../server/db';
import { loadMigrations, migrate } from '../server/migrate';
import { PgBookingService } from '../server/pgBookingService';
import { freshDb } from './testDb';

const EVENT = 'cin-1900';
const freeSeats = (() => {
  const all = seatIdsFor(EVENT)!;
  const sold = new Set(mockSoldSeats(EVENT, all));
  return all.filter((s) => !sold.has(s));
})();

async function freshService(clock = { t: Date.UTC(2026, 10, 28, 18) }) {
  const db = await freshDb();
  await migrate(db);
  const service = new PgBookingService(db, { seatIdsFor, priceFor, now: () => clock.t });
  await service.seedMockSales();
  return { db, service, clock };
}

describe('config validation', () => {
  it('defaults are valid', () => {
    const c = loadConfig({}, []);
    expect(c).toMatchObject({ port: 3001, host: '127.0.0.1', holdMinutes: 10, allowedOrigins: [], serveStatic: false });
  });
  it('reads the --static flag and env values', () => {
    const c = loadConfig({ PORT: '8080', ALLOWED_ORIGINS: 'https://a.example, https://b.example:8443', TRUST_PROXY: 'true' }, [
      'node',
      'index.ts',
      '--static',
    ]);
    expect(c.port).toBe(8080);
    expect(c.allowedOrigins).toEqual(['https://a.example', 'https://b.example:8443']);
    expect(c.trustProxy).toBe(true);
    expect(c.serveStatic).toBe(true);
  });
  it('reports every problem at once', () => {
    let err: unknown;
    try {
      loadConfig(
        { PORT: '99999', HOLD_MINUTES: 'ten', DATABASE_URL: 'mysql://x', ALLOWED_ORIGINS: 'https://a.example/path', TRUST_PROXY: 'maybe' },
        [],
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    const msg = (err as Error).message;
    for (const key of ['PORT', 'HOLD_MINUTES', 'DATABASE_URL', 'ALLOWED_ORIGINS', 'TRUST_PROXY']) expect(msg).toContain(key);
  });
});

describe('versioned migrations', () => {
  it('applies all migrations once on a fresh database, then nothing', async () => {
    const db = await freshDb();
    const versions = loadMigrations().map((m) => m.version);
    expect(versions).toEqual(ALL_VERSIONS);
    expect(await migrate(db)).toEqual(versions);
    expect(await migrate(db)).toEqual([]);
    const { rows } = await db.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toEqual(versions);
    await db?.close();
  });

  it('baselines a Phase 5 database (tables exist, no schema_migrations) without losing data', async () => {
    const db = await freshDb();
    // Recreate the Phase 5 state: the 001 schema applied directly, plus a booking.
    await db.exec(loadMigrations()[0]!.sql);
    await db.query(
      "INSERT INTO bookings (reference, event_id, total_minor, currency, created_at) VALUES ('SV-OLD001', $1, 1200, 'EUR', now())",
      [EVENT],
    );
    expect(await migrate(db)).toEqual(ALL_VERSIONS);
    const { rows } = await db.query<{ reference: string; hold_id: string | null }>(
      "SELECT reference, hold_id FROM bookings WHERE reference = 'SV-OLD001'",
    );
    expect(rows).toEqual([{ reference: 'SV-OLD001', hold_id: null }]);
    await db?.close();
  });

  it('a failing migration rolls back and is not recorded', async () => {
    const db = await freshDb();
    const bad = [...loadMigrations(), { version: 99, name: 'broken', sql: 'CREATE TABLE t3 (id int); SELECT nope_column FROM t3' }];
    await expect(migrate(db, bad)).rejects.toThrow();
    const { rows } = await db.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toEqual(ALL_VERSIONS);
    const t3 = await db.query("SELECT to_regclass('public.t3') AS t");
    expect(t3.rows[0]).toEqual({ t: null });
    await db?.close();
  });
});

describe('booking correctness', () => {
  let db: Db;
  let service: PgBookingService;
  let clock: { t: number };
  beforeAll(async () => ({ db, service, clock } = await freshService()), 60_000);
  afterAll(() => db?.close());

  it('confirm is idempotent: a retry returns the identical booking', async () => {
    const h = await service.hold(EVENT, freeSeats.slice(0, 2));
    const first = await service.confirm(h.id, { name: 'Test Customer', email: 'test@example.com' });
    const retry = await service.confirm(h.id, { name: 'Test Customer', email: 'test@example.com' });
    expect(retry).toEqual(first);
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM bookings WHERE hold_id = $1', [h.id]);
    expect(rows[0]!.n).toBe(1);
  });

  it('a hold that expired without being confirmed still returns HOLD_EXPIRED', async () => {
    const h = await service.hold(EVENT, freeSeats.slice(2, 3));
    clock.t += 11 * 60_000;
    await expect(service.confirm(h.id, { name: 'Test Customer', email: 'test@example.com' })).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
  });

  it('background sweep removes expired holds and reports the count', async () => {
    await service.hold(EVENT, freeSeats.slice(3, 4));
    await service.hold(EVENT, freeSeats.slice(4, 5));
    expect(await service.sweepExpired()).toBe(0);
    clock.t += 10 * 60_000;
    expect(await service.sweepExpired()).toBe(2);
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM holds');
    expect(rows[0]!.n).toBe(0);
  });

  it('local (offline) service has the same idempotent confirm', async () => {
    const local = new LocalBookingService({ seatIdsFor, priceFor });
    const h = await local.hold(EVENT, freeSeats.slice(0, 1));
    const first = await local.confirm(h.id, { name: 'Test Customer', email: 'test@example.com' });
    expect(await local.confirm(h.id, { name: 'Test Customer', email: 'test@example.com' })).toEqual(first);
  });
});

describe('HTTP hardening', () => {
  let db: Db;
  let app: FastifyInstance;
  let staticDir: string;

  beforeAll(async () => {
    ({ db } = await freshService());
    const service = new PgBookingService(db, { seatIdsFor, priceFor });
    staticDir = mkdtempSync(join(tmpdir(), 'seatview-static-'));
    mkdirSync(join(staticDir, 'assets'));
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>SeatView3D</title>');
    writeFileSync(join(staticDir, 'assets', 'app-abc123.js'), 'console.log(1);'.repeat(200));
    app = buildApp(service, {
      rateLimit: { max: 20, holdsMax: 3 },
      allowedOrigins: ['https://tickets.example'],
      ready: () => service.ping(),
      staticDir,
    });
  }, 60_000);
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('sends security headers', async () => {
    const r = await app.inject({ url: '/api/events' });
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['strict-transport-security']).toBeDefined();
    expect(r.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('CORS: only configured origins get Access-Control-Allow-Origin', async () => {
    const ok = await app.inject({ url: '/api/events', headers: { origin: 'https://tickets.example' } });
    expect(ok.headers['access-control-allow-origin']).toBe('https://tickets.example');
    const evil = await app.inject({ url: '/api/events', headers: { origin: 'https://evil.example' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate limits holds per IP with a JSON 429', async () => {
    const body = { eventId: EVENT, seatIds: ['Z99'] }; // rejected by the service, but still counted
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push((await app.inject({ method: 'POST', url: '/api/holds', payload: body, remoteAddress: '10.0.0.7' })).statusCode);
    }
    expect(codes).toEqual([400, 400, 400, 429, 429]);
    const r = await app.inject({ method: 'POST', url: '/api/holds', payload: body, remoteAddress: '10.0.0.7' });
    expect(r.json().code).toBe('RATE_LIMITED');
    expect(r.headers['retry-after']).toBeDefined();
    // Another client is unaffected.
    expect((await app.inject({ method: 'POST', url: '/api/holds', payload: body, remoteAddress: '10.0.0.8' })).statusCode).toBe(400);
  });

  it('rejects non-JSON bodies (blocks simple cross-site form posts)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/holds',
      payload: 'eventId=cin-1900',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      remoteAddress: '10.0.0.9',
    });
    expect(r.statusCode).toBe(415);
  });

  it('health and readiness', async () => {
    expect((await app.inject({ url: '/api/health' })).json()).toEqual({ ok: true });
    expect((await app.inject({ url: '/api/ready' })).statusCode).toBe(200);
    const broken = buildApp(new LocalBookingService({ seatIdsFor, priceFor }), {
      ready: async () => {
        throw new Error('db down');
      },
    });
    expect((await broken.inject({ url: '/api/ready' })).statusCode).toBe(503);
    await broken.close();
  });

  it('gzips large API responses (stadium availability)', async () => {
    const r = await app.inject({ url: '/api/events/sta-match/availability', headers: { 'accept-encoding': 'gzip' } });
    expect(r.headers['content-encoding']).toBe('gzip');
    const plain = gunzipSync(r.rawPayload).toString();
    const parsed = JSON.parse(plain) as { sold: string[] };
    expect(parsed.sold.length).toBeGreaterThan(10_000);
    expect(r.rawPayload.length).toBeLessThan(plain.length / 3);
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('serves the built frontend with correct caching; unknown API routes are JSON 404', async () => {
    const index = await app.inject({ url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('SeatView3D');
    expect(index.headers['cache-control']).toBe('no-cache');
    const asset = await app.inject({ url: '/assets/app-abc123.js', headers: { 'accept-encoding': 'gzip' } });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(asset.headers['content-encoding']).toBe('gzip');
    const missing = await app.inject({ url: '/api/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('NOT_FOUND');
  });

  it('refuses to start static mode without a build', () => {
    expect(() => buildApp(new LocalBookingService({ seatIdsFor, priceFor }), { staticDir: join(staticDir, 'missing') })).toThrow(
      /npm run build/,
    );
  });
});

describe('mock sales re-sync after a layout change', () => {
  it('replaces only the mock claims, keeps real bookings, reports orphans', async () => {
    const db = await freshDb();
    await migrate(db);
    const all = seatIdsFor(EVENT)!;
    // Layout "A": the full cinema. Book one free seat for real.
    const a = new PgBookingService(db, { seatIdsFor, priceFor });
    expect((await a.seedMockSales()).find((r) => r.eventId === EVENT)!.reseeded).toBe(true);
    expect((await a.seedMockSales()).find((r) => r.eventId === EVENT)!.reseeded).toBe(false); // in sync
    const sold = new Set(mockSoldSeats(EVENT, all));
    const realSeat = all.find((s) => !sold.has(s))!;
    const h = await a.hold(EVENT, [realSeat]);
    await a.confirm(h.id, { name: 'Real Customer', email: 'real@example.com' });
    // Layout "B": the venue loses its first row of seats (ids change), including our booked seat? No —
    // drop row A only; the real booking is elsewhere unless it was in row A.
    const layoutB = (id: string) => (id === EVENT ? all.filter((s) => !s.startsWith('A')) : seatIdsFor(id));
    const b = new PgBookingService(db, { seatIdsFor: layoutB, priceFor });
    const rep = (await b.seedMockSales()).find((r) => r.eventId === EVENT)!;
    expect(rep.reseeded).toBe(true);
    expect(rep.orphanedRealClaims).toBe(realSeat.startsWith('A') ? 1 : 0);
    const { rows } = await db.query<{ seat_id: string }>(
      "SELECT seat_id FROM seat_claims WHERE event_id = $1 AND booking_ref = 'MOCK-cin-1900'",
      [EVENT],
    );
    expect(new Set(rows.map((r) => r.seat_id))).toEqual(new Set(mockSoldSeats(EVENT, layoutB(EVENT)!)));
    const real = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM bookings WHERE NOT is_mock AND customer_email = 'real@example.com'",
    );
    expect(real.rows[0]!.n).toBe(1);
    await db.close();
  });
});

describe('SPA routes in static mode', () => {
  it('serves the app shell for client routes, JSON 404 for API and non-HTML requests', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seatview-spa-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>SeatView</title>');
    const app = buildApp(new LocalBookingService({ seatIdsFor, priceFor }), { staticDir: dir });
    const page = await app.inject({ url: '/event/csk-vs-mi', headers: { accept: 'text/html' } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('SeatView');
    expect(page.headers['cache-control']).toBe('no-cache');
    expect((await app.inject({ url: '/api/nope', headers: { accept: 'text/html' } })).statusCode).toBe(404);
    expect((await app.inject({ url: '/missing.js', headers: { accept: '*/*' } })).statusCode).toBe(404);
    await app.close();
  });
});
