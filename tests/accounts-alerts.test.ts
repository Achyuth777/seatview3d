import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { priceFor, seatIdsFor } from '../src/booking/venues';
import type { DiscoveryPayload } from '../src/discovery/directory';
import { buildApp } from '../server/app';
import type { Db } from '../server/db';
import { migrate } from '../server/migrate';
import { PgBookingService } from '../server/pgBookingService';
import { Accounts } from '../server/platform/accounts';
import { CatalogStore } from '../server/platform/catalogStore';
import type { FeedProvider, RawShow } from '../server/platform/feeds';
import { OutboxMailer } from '../server/platform/mailer';
import { freshDb } from './testDb';

const T0 = new Date('2026-11-24T04:30:00Z'); // 10:00 IST
const show = (time: string, over: Partial<RawShow> = {}): RawShow => ({
  externalKey: `k-${time}`, externalFilmId: '7', title: 'Feed Film', posterUrl: null, localStart: `2026-11-24T${time}`, language: 'Tamil', format: '2D', providerUrl: null, ...over,
});

describe('accounts, alerts and data records', () => {
  let db: Db;
  let app: FastifyInstance;
  let catalog: CatalogStore;
  let clock = T0;
  const feed = { shows: [] as RawShow[], fail: false };
  const provider: FeedProvider = { id: 'testfeed', fetchCinema: async () => { if (feed.fail) throw new Error('Provider down'); return feed.shows; } };
  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, cookie?: string, payload?: object) =>
    app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
  const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0]!;
  const lastMail = async (to: string, kind: string) => {
    const { rows } = await db.query<{ body: string }>('SELECT body FROM mail_outbox WHERE to_email = $1 AND kind = $2 ORDER BY id DESC LIMIT 1', [to, kind]);
    return rows[0]?.body ?? '';
  };
  const tokenIn = (body: string) => /token=([A-Za-z0-9_-]+)/.exec(body)![1]!;
  let n = 0;
  const register = async () => {
    const email = `a${++n}@example.com`;
    const res = await call('POST', '/api/auth/register', undefined, { email, password: 'correct-horse-1', name: 'Test' });
    return { email, cookie: cookieOf(res), id: res.json().user.id as string };
  };
  const verified = async () => {
    const u = await register();
    await call('POST', '/api/auth/verify', undefined, { token: tokenIn(await lastMail(u.email, 'verify')) });
    return u;
  };

  beforeAll(async () => {
    db = await freshDb();
    await migrate(db);
    catalog = new CatalogStore(db, provider, () => clock, { cacheHours: 6 });
    await catalog.syncDirectory();
    const booking = new PgBookingService(db, { seatIdsFor, priceFor, holdMs: 60_000 });
    const accounts = new Accounts(db, catalog, booking, () => clock, { mailer: new OutboxMailer(db), appOrigin: 'https://seatview.example', sessionHours: 2 });
    app = buildApp(booking, { platform: { catalog, accounts, feedProviderId: 'testfeed', devOutbox: true, catalogDb: db } });
    await app.ready();
    await catalog.setFeedRef({ id: 'setup', email: 'setup@example.com' }, 'chn-pvr-escape', 'testfeed', 'ext-1');
  });
  afterAll(async () => { await app.close(); await db.close(); });
  beforeEach(() => { clock = T0; feed.fail = false; });

  it('requires a confirmed email before saving; the link works once', async () => {
    const u = await register();
    expect((await call('GET', '/api/me', u.cookie)).json().user.emailVerified).toBe(false);
    const body = await lastMail(u.email, 'verify');
    expect(body).toContain('https://seatview.example/verify-email?token=');
    expect((await call('PUT', '/api/me/favourites/chn-pvr-vr', u.cookie)).json().code).toBe('VERIFY_EMAIL');
    const token = tokenIn(body);
    expect((await call('POST', '/api/auth/verify', undefined, { token })).statusCode).toBe(200);
    expect((await call('POST', '/api/auth/verify', undefined, { token })).statusCode).toBe(400);
    expect((await call('PUT', '/api/me/favourites/chn-pvr-vr', u.cookie)).statusCode).toBe(204);
  });

  it('resets a password, signs out every session, and expires reset links', async () => {
    const u = await verified();
    expect((await call('POST', '/api/auth/forgot', undefined, { email: 'nobody@example.com' })).statusCode).toBe(204);
    await call('POST', '/api/auth/forgot', undefined, { email: u.email });
    const token = tokenIn(await lastMail(u.email, 'reset'));
    expect((await call('POST', '/api/auth/reset', undefined, { token, password: 'short' })).statusCode).toBe(400);
    expect((await call('POST', '/api/auth/reset', undefined, { token, password: 'a-brand-new-pass' })).statusCode).toBe(204);
    expect((await call('GET', '/api/me', u.cookie)).json().user).toBeNull();
    expect((await call('POST', '/api/auth/login', undefined, { email: u.email, password: 'correct-horse-1' })).statusCode).toBe(401);
    expect((await call('POST', '/api/auth/login', undefined, { email: u.email, password: 'a-brand-new-pass' })).statusCode).toBe(200);
    await call('POST', '/api/auth/forgot', undefined, { email: u.email });
    const late = tokenIn(await lastMail(u.email, 'reset'));
    clock = new Date(T0.getTime() + 61 * 60_000);
    expect((await call('POST', '/api/auth/reset', undefined, { token: late, password: 'another-new-pass' })).statusCode).toBe(400);
  });

  it('expires sessions after the configured lifetime', async () => {
    const u = await register();
    expect((await call('GET', '/api/me', u.cookie)).json().user).not.toBeNull();
    clock = new Date(T0.getTime() + 3 * 3_600_000);
    expect((await call('GET', '/api/me', u.cookie)).json().user).toBeNull();
    expect((await call('GET', '/api/me/library', u.cookie)).statusCode).toBe(401);
  });

  it('refuses email reminders while delivery is only simulated', async () => {
    const u = await verified();
    expect((await call('GET', '/api/config')).json().emailDelivery).toBe('simulated');
    expect((await call('PATCH', '/api/me', u.cookie, { notify: { emailReminders: true } })).json().code).toBe('REMINDERS_UNAVAILABLE');
    expect((await call('PATCH', '/api/me', u.cookie, { notify: { showChanges: false } })).statusCode).toBe(200);
  });

  it('reads the dev outbox only for test addresses', async () => {
    expect((await call('GET', '/api/dev/outbox?to=someone@gmail.com')).statusCode).toBe(403);
    expect((await call('GET', '/api/dev/outbox?to=a1@example.com')).statusCode).toBe(200);
  });

  it('delivers each alert exactly once; an outage or empty answer is never a cancellation', async () => {
    const u = await verified();
    feed.shows = [show('18:00'), show('21:00')];
    expect((await catalog.refresh('chennai')).status).toBe('success');
    const city = (await call('GET', '/api/discovery?city=chennai')).json() as DiscoveryPayload;
    const live = city.screenings.filter((s) => !s.isDemo);
    expect(city.feed.expiresAt).toBeTruthy();
    for (const s of live) await call('PUT', `/api/me/saved/${s.id}`, u.cookie);
    expect((await call('POST', '/api/me/alerts/deliver', u.cookie)).json().alerts).toEqual([]);

    feed.fail = true;
    expect((await catalog.refresh('chennai')).status).toBe('failed');
    feed.fail = false;
    feed.shows = [];
    expect((await catalog.refresh('chennai')).message).toContain('kept, not cancelled');
    expect((await call('POST', '/api/me/alerts/deliver', u.cookie)).json().alerts).toEqual([]);
    expect(((await call('GET', '/api/discovery?city=chennai')).json() as DiscoveryPayload).screenings.filter((s) => !s.isDemo)).toHaveLength(2);

    feed.shows = [show('18:00', { localStart: '2026-11-24T18:30' })];
    await catalog.refresh('chennai');
    await catalog.refresh('chennai'); // the same change imported twice
    const first = (await call('POST', '/api/me/alerts/deliver', u.cookie)).json().alerts as { kind: string; oldStart: string; newStart: string | null; cinemaId: string }[];
    expect(first.map((a) => a.kind).sort()).toEqual(['changed', 'removed']);
    const changed = first.find((a) => a.kind === 'changed')!;
    expect([changed.oldStart, changed.newStart, changed.cinemaId]).toEqual(['2026-11-24T18:00', '2026-11-24T18:30', 'chn-pvr-escape']);
    expect((await call('POST', '/api/me/alerts/deliver', u.cookie)).json().alerts).toEqual([]);
  });

  it('marks cached times expired after the cache window', async () => {
    feed.shows = [show('20:00')];
    await catalog.refresh('chennai');
    clock = new Date(T0.getTime() + 7 * 3_600_000);
    expect(((await call('GET', '/api/discovery?city=chennai')).json() as DiscoveryPayload).feed.status).toBe('expired');
  });

  it('keeps an admin provider link through the directory sync, and verified layouts need a record', async () => {
    const admin = { id: 'admin-1', email: 'admin@example.com' };
    await catalog.setProviderLink(admin, 'koc-pvr-lulu', 'https://example.com/lulu-showtimes');
    await catalog.syncDirectory();
    expect((await catalog.cinema('koc-pvr-lulu')).cinema.providerUrl).toBe('https://example.com/lulu-showtimes');
    await expect(catalog.setProviderLink(admin, 'koc-pvr-lulu', 'http://insecure.example')).rejects.toThrow(/https/);

    await db.query(`INSERT INTO auditoriums (id, cinema_id, name, model_id, verification) VALUES ('koc-flag-only', 'koc-pvr-lulu', 'Flag only', 'scope-14m', 'verified')`);
    expect((await catalog.auditorium('koc-flag-only')).auditorium.verification).toBe('illustrative');
    await catalog.mapAuditorium(admin, 'koc-a5', { cinemaId: 'koc-pvr-lulu', name: 'Audi 5', modelId: 'scope-14m', verification: 'verified', note: 'Laser survey, 2026-11-20' });
    expect((await catalog.auditorium('koc-a5')).auditorium).toMatchObject({ verification: 'verified', note: 'Measured: Laser survey, 2026-11-20' });
    await catalog.mapAuditorium(admin, 'koc-a5', { cinemaId: 'koc-pvr-lulu', name: 'Audi 5', modelId: 'scope-14m', verification: 'illustrative' });
    expect((await catalog.auditorium('koc-a5')).auditorium.verification).toBe('illustrative');
    const statuses = (await db.query<{ status: string }>(`SELECT status FROM layout_verifications WHERE auditorium_id = 'koc-a5' ORDER BY id`)).rows.map((r) => r.status);
    expect(statuses).toEqual(['verified', 'revoked']);
  });
});
