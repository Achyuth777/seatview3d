import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { priceFor, seatIdsFor } from '../src/booking/venues';
import { buildApp } from '../server/app';
import { ConfigError, loadConfig } from '../server/config';
import type { Db } from '../server/db';
import { migrate } from '../server/migrate';
import { PgBookingService } from '../server/pgBookingService';
import { Accounts } from '../server/platform/accounts';
import { CatalogStore } from '../server/platform/catalogStore';
import { freshDb } from './testDb';

describe('structured logs', () => {
  let db: Db;
  let app: FastifyInstance;
  const lines: string[] = [];

  beforeAll(async () => {
    db = await freshDb();
    await migrate(db);
    const catalog = new CatalogStore(db);
    const booking = new PgBookingService(db, { seatIdsFor, priceFor, holdMs: 60_000 });
    app = buildApp(booking, {
      platform: { catalog, accounts: new Accounts(db, catalog, booking), feedProviderId: null },
      logger: { level: 'info', stream: { write: (l: string) => { lines.push(l); } } },
    });
    await app.ready();
  });
  afterAll(async () => { await app.close(); await db.close(); });

  it('logs a request ID and no personal data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/bookings/SV-ABC123?email=private.person%40example.com', headers: { 'x-request-id': 'trace-12345678', cookie: 'sv_session=secret-token' } });
    expect(res.headers['x-request-id']).toBe('trace-12345678');
    await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'another.person@example.com', password: 'not-the-password' } });
    const generated = await app.inject({ method: 'GET', url: '/api/health' });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const out = lines.join('');
    const entries = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(entries.some((e) => e.requestId === 'trace-12345678')).toBe(true);
    expect(entries.every((e) => typeof e.requestId === 'string' || !('req' in e))).toBe(true);
    expect(entries.every((e) => e.service === 'seatview' && !('hostname' in e))).toBe(true);
    for (const secret of ['private.person', 'example.com', 'another.person', 'not-the-password', 'secret-token', 'remoteAddress', '?email']) {
      expect(out, secret).not.toContain(secret);
    }
  });
});

describe('content security policy', () => {
  it('upgrades insecure requests only for an https origin', async () => {
    const booking = { getAvailability: async () => ({ sold: new Set<string>(), heldByOthers: new Set<string>() }) } as never;
    for (const [httpsOrigin, expected] of [[true, true], [false, false]] as const) {
      const app = buildApp(booking, { httpsOrigin });
      const csp = String((await app.inject({ method: 'GET', url: '/api/health' })).headers['content-security-policy']);
      expect(csp.includes('upgrade-insecure-requests')).toBe(expected);
      await app.close();
    }
  });
});

describe('startup configuration', () => {
  const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db:5432/seatview', APP_ORIGIN: 'https://seatview.example' };
  const fails = (env: Record<string, string>) => {
    try { loadConfig(env, []); return null; } catch (e) { return e instanceof ConfigError ? e.message : String(e); }
  };

  it('accepts a complete production configuration, with admin two-step sign-in on', () => {
    expect(loadConfig(prod, []).adminMfaRequired).toBe(true);
  });
  it('refuses development-only settings in production', () => {
    expect(fails({ ...prod, DATABASE_URL: '' })).toMatch(/DATABASE_URL is required/);
    expect(fails({ ...prod, APP_ORIGIN: '' })).toMatch(/APP_ORIGIN is required/);
    expect(fails({ ...prod, APP_ORIGIN: 'http://seatview.example' })).toMatch(/https/);
    expect(fails({ ...prod, DEV_OUTBOX: 'true' })).toMatch(/DEV_OUTBOX/);
    expect(fails({ ...prod, FEED_PROVIDER: 'fixture', FEED_FIXTURE_FILE: 'x.json' })).toMatch(/simulated/);
    expect(fails({ ...prod, ADMIN_MFA_REQUIRED: 'false' })).toMatch(/cannot be turned off/);
    expect(fails({ ...prod, MAILER: 'smtp' })).toMatch(/no email provider/);
  });
  it('lists every problem at once', () => {
    expect(fails({ NODE_ENV: 'production', PORT: 'abc', HOLD_MINUTES: '999' })!.split('\n').length).toBeGreaterThan(3);
  });
});
