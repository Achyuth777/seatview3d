import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { priceFor, seatIdsFor } from '../src/booking/venues';
import { CITIES, DEMO_SCREENINGS, REAL_CINEMAS, type Cinema, type DiscoveryPayload, type Screening } from '../src/discovery/directory';
import { applyFilters, coerceFilters, dedupeScreenings, directoryPayload, facets, groupByCinema, istDate, istNow, otherCityMatch, searchCinemas } from '../src/discovery/query';
import { buildApp } from '../server/app';
import type { Db } from '../server/db';
import { migrate } from '../server/migrate';
import { PgBookingService } from '../server/pgBookingService';
import { Accounts } from '../server/platform/accounts';
import { CatalogStore } from '../server/platform/catalogStore';
import { parseMovieGlu, type FeedProvider, type RawShow } from '../server/platform/feeds';
import { freshDb } from './testDb';

const chennai = CITIES[0]!;
const inCity = (id: string) => REAL_CINEMAS.filter((c) => c.cityId === id);
const NOW = new Date('2026-11-24T04:30:00Z'); // 10:00 IST

describe('discovery rules', () => {
  it('resolves mall names to the right venue in each city', () => {
    expect(searchCinemas(inCity('chennai'), 'Forum Mall')[0]!.cinema.id).toBe('chn-pvr-palazzo');
    expect(searchCinemas(inCity('chennai'), 'Forum Mall')[0]!.cinema.neighbourhood).toBe('Vadapalani');
    expect(searchCinemas(inCity('chennai'), 'Palazzo')[0]!.cinema.id).toBe('chn-pvr-palazzo');
    expect(searchCinemas(inCity('chennai'), 'VR Mall')[0]!.cinema.neighbourhood).toBe('Anna Nagar');
    expect(searchCinemas(inCity('chennai'), 'anna nagar')[0]!.cinema.id).toBe('chn-pvr-vr');
    expect(searchCinemas(inCity('bengaluru'), 'Forum Mall')[0]!.cinema.id).toBe('blr-pvr-nexus');
    expect(searchCinemas(inCity('hyderabad'), 'Forum Mall')[0]!.cinema.id).toBe('hyd-pvr-nexus');
    expect(searchCinemas(inCity('kochi'), 'Forum Mall')[0]!.cinema.id).toBe('koc-pvr-forum');
    expect(searchCinemas(inCity('mumbai'), 'Infiniti Mall').map((h) => h.cinema.neighbourhood).sort()).toEqual(['Andheri West', 'Malad West']);
    expect(otherCityMatch('chennai', 'Lulu Mall')?.city.id).toBe('kochi');
  });

  it('never offers Malayalam in Chennai, and an old link drops it', () => {
    const p = directoryPayload(chennai, NOW);
    expect(facets(p.screenings, { date: '', language: '' }).languages).not.toContain('Malayalam');
    expect(coerceFilters(p.screenings, { date: '', language: 'Malayalam' }).language).toBe('');
    const kochi = directoryPayload(CITIES.find((c) => c.id === 'kochi')!, NOW);
    expect(facets(kochi.screenings, { date: '', language: '' }).languages).toEqual(['Malayalam']);
  });

  it('every facet choice leads to at least one show', () => {
    for (const city of CITIES) {
      const { screenings } = directoryPayload(city, NOW);
      const base = facets(screenings, { date: '', language: '' });
      for (const date of base.dates) for (const language of facets(screenings, { date, language: '' }).languages) {
        expect(applyFilters(screenings, { date, language }).length).toBeGreaterThan(0);
      }
    }
  });

  it('groups a film at a cinema into separate showtime records', () => {
    const p = directoryPayload(chennai, NOW);
    const kalki = groupByCinema(p.screenings, p.cinemas, p.films)[0]!.films.find((f) => f.film.id === 'kalki-2898-ad')!;
    expect(kalki.shows.map((s) => s.id)).toEqual(['cin-1900', 'cin-2145']);
    expect(kalki.shows.map((s) => s.language)).toEqual(['Telugu', 'Tamil']);
  });

  it('uses Asia/Kolkata across the UTC date line and dedupes provider rows', () => {
    expect(istDate(new Date('2026-11-23T19:00:00Z'))).toBe('2026-11-24');
    expect(istNow(new Date('2026-11-23T18:29:00Z'))).toBe('2026-11-23T23:59');
    const row = { cinemaId: 'c', filmId: 'f', startsAt: '2026-11-24T10:00', language: 'Tamil', format: '2D' };
    expect(dedupeScreenings([row, { ...row }, { ...row, format: 'IMAX' }])).toHaveLength(2);
  });

  it('parses the documented MovieGlu shape without inventing a language', () => {
    const shows = parseMovieGlu('77', '2026-11-24', { films: [{ film_id: 5, film_name: 'X', film_image: null, showings: { Standard: { times: [{ start_time: '19:30' }, { start_time: 'bad' }] }, IMAX: { times: [{ start_time: '21:00' }] } } }] });
    expect(shows.map((s) => [s.localStart, s.format, s.language])).toEqual([['2026-11-24T19:30', 'Standard', null], ['2026-11-24T21:00', 'IMAX', null]]);
  });
});

function fakeProvider() {
  const state = { shows: [] as RawShow[], fail: false };
  const provider: FeedProvider = { id: 'testfeed', fetchCinema: async () => { if (state.fail) throw new Error('Provider down'); return state.shows; } };
  return { state, provider };
}
const rawShow = (time: string, over: Partial<RawShow> = {}): RawShow => ({
  externalKey: `k-${time}`, externalFilmId: '1', title: 'Live Film', posterUrl: null, localStart: `2026-11-24T${time}`, language: 'Tamil', format: '2D', providerUrl: 'https://provider.example/show', ...over,
});

describe('platform API', () => {
  let db: Db;
  let app: FastifyInstance;
  let catalog: CatalogStore;
  let accounts: Accounts;
  let booking: PgBookingService;
  let feed: ReturnType<typeof fakeProvider>;
  let clock = NOW;

  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, cookie?: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url, payload, headers: { ...(cookie ? { cookie } : {}), ...headers } });
  let n = 0;
  const signUp = async (name = 'User') => {
    const email = `u${++n}@example.com`;
    const res = await call('POST', '/api/auth/register', undefined, { email, password: 'correct-horse-1', name });
    expect(res.statusCode).toBe(201);
    // These tests are about saving and admin; email verification has its own tests.
    await db.query('UPDATE users SET email_verified_at = now() WHERE email = $1', [email]);
    return { email, id: res.json().user.id as string, cookie: String(res.headers['set-cookie']).split(';')[0]! };
  };
  const admin = async () => { const u = await signUp('Admin'); await accounts.setRole(u.email, 'admin'); return u; };

  beforeAll(async () => {
    db = await freshDb();
    await migrate(db);
    feed = fakeProvider();
    catalog = new CatalogStore(db, feed.provider, () => clock);
    await catalog.syncDirectory();
    booking = new PgBookingService(db, { seatIdsFor, priceFor, holdMs: 60_000 });
    accounts = new Accounts(db, catalog, booking, () => clock);
    app = buildApp(booking, { platform: { catalog, accounts, feedProviderId: 'testfeed' } });
    await app.ready();
  });
  afterAll(async () => { await app.close(); await db.close(); });
  beforeEach(() => { clock = NOW; feed.state.fail = false; feed.state.shows = []; });

  it('serves a city, its cinemas and honest directory status', async () => {
    const r = (await call('GET', '/api/discovery?city=chennai')).json() as DiscoveryPayload;
    expect(r.cinemas.some((c: Cinema) => c.id === 'chn-pvr-palazzo')).toBe(true);
    expect(r.feed.status).toBe('directory');
    expect(r.screenings.every((s: Screening) => s.isDemo)).toBe(true);
    expect((await call('GET', '/api/discovery?city=nowhere')).statusCode).toBe(404);
  });

  it('expires past shows', async () => {
    clock = new Date('2026-11-28T14:00:00Z'); // 19:30 IST: the 19:00 Kalki has started
    const r = (await call('GET', '/api/discovery?city=chennai')).json() as DiscoveryPayload;
    const ids = r.screenings.map((s: Screening) => s.id);
    expect(ids).not.toContain('cin-1900');
    expect(ids).toContain('cin-2145');
  });

  it('blocks admin operations for guests and regular users', async () => {
    const u = await signUp();
    for (const cookie of [undefined, u.cookie]) {
      const want = cookie ? 403 : 401;
      expect((await call('GET', '/api/admin/overview', cookie)).statusCode).toBe(want);
      expect((await call('PATCH', '/api/admin/cinemas/chn-pvr-vr', cookie, { name: 'Hacked' })).statusCode).toBe(want);
      expect((await call('POST', '/api/admin/refresh/chennai', cookie)).statusCode).toBe(want);
      expect((await call('POST', '/api/admin/cinemas/chn-pvr-vr/merge', cookie, { intoId: 'chn-pvr-palazzo' })).statusCode).toBe(want);
      expect((await call('PUT', '/api/admin/auditoriums/x', cookie, { cinemaId: 'chn-pvr-vr', name: 'S', modelId: null, verification: null })).statusCode).toBe(want);
    }
    await call('PATCH', '/api/me', u.cookie, { role: 'admin' });
    expect((await call('GET', '/api/me', u.cookie)).json().user).not.toHaveProperty('role');
    expect((await call('GET', '/api/admin/overview', u.cookie)).statusCode).toBe(403);
  });

  it('refuses a cross-site write', async () => {
    const u = await signUp();
    const r = await call('PUT', '/api/me/favourites/chn-pvr-vr', u.cookie, undefined, { origin: 'https://evil.example', host: 'seatview.example' });
    expect(r.statusCode).toBe(403);
  });

  it('keeps one account’s data away from another', async () => {
    const a = await signUp();
    const b = await signUp();
    await call('PUT', '/api/me/favourites/chn-pvr-palazzo', a.cookie);
    await call('PUT', '/api/me/saved/cin-2145', a.cookie);
    const mine = (await call('GET', '/api/me/library', a.cookie)).json();
    const theirs = (await call('GET', '/api/me/library', b.cookie)).json();
    expect(mine.favourites).toHaveLength(1);
    expect(mine.saved).toHaveLength(1);
    expect(theirs.favourites).toHaveLength(0);
    expect(theirs.saved).toHaveLength(0);
    await call('DELETE', '/api/me/saved/cin-2145', b.cookie);
    expect((await call('GET', '/api/me/library', a.cookie)).json().saved).toHaveLength(1);
    expect((await call('GET', '/api/me/library')).statusCode).toBe(401);
  });

  it('recovers favourites after signing back in; a temporary city needs no profile write', async () => {
    const a = await signUp();
    await call('PATCH', '/api/me', a.cookie, { homeCity: 'chennai', languages: ['Tamil'] });
    await call('PUT', '/api/me/favourites/chn-pvr-vr', a.cookie);
    await call('POST', '/api/auth/logout', a.cookie);
    expect((await call('GET', '/api/me', a.cookie)).json().user).toBeNull();
    const login = await call('POST', '/api/auth/login', undefined, { email: a.email, password: 'correct-horse-1' });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    expect((await call('GET', '/api/me', cookie)).json().user.homeCity).toBe('chennai');
    expect((await call('GET', '/api/me/library', cookie)).json().favourites[0].id).toBe('chn-pvr-vr');
    expect((await call('POST', '/api/auth/login', undefined, { email: a.email, password: 'wrong-password' })).statusCode).toBe(401);
  });

  it('keeps cached shows through an outage, then flags changed and removed saved shows', async () => {
    const ad = await admin();
    const u = await signUp();
    await catalog.setFeedRef({ id: ad.id, email: ad.email }, 'chn-pvr-escape', 'testfeed', 'ext-1');
    feed.state.shows = [rawShow('18:00'), rawShow('21:00'), rawShow('23:00'), rawShow('18:00')];
    const ok = (await call('POST', '/api/admin/refresh/chennai', ad.cookie)).json();
    expect(ok.status).toBe('success');
    let city = (await call('GET', '/api/discovery?city=chennai')).json() as DiscoveryPayload;
    const live = city.screenings.filter((s: Screening) => !s.isDemo);
    expect(live).toHaveLength(3);
    expect(city.feed.status).toBe('live');
    const byTime = (t: string) => live.find((s: Screening) => s.startsAt.endsWith(t))!;
    await call('PUT', `/api/me/saved/${byTime('18:00').id}`, u.cookie);
    await call('PUT', `/api/me/saved/${byTime('21:00').id}`, u.cookie);

    feed.state.fail = true;
    const failed = (await call('POST', '/api/admin/refresh/chennai', ad.cookie)).json();
    expect(failed.status).toBe('failed');
    city = (await call('GET', '/api/discovery?city=chennai')).json() as DiscoveryPayload;
    expect(city.feed.status).toBe('stale');
    expect(city.feed.lastSuccessAt).toBeTruthy();
    expect(city.screenings.filter((s: Screening) => !s.isDemo)).toHaveLength(3);

    feed.state.fail = false;
    feed.state.shows = [rawShow('18:00', { externalKey: 'k-18:00', localStart: '2026-11-24T18:30' }), rawShow('23:00')];
    await call('POST', '/api/admin/refresh/chennai', ad.cookie);
    const saved = (await call('GET', '/api/me/library', u.cookie)).json().saved as { screeningId: string; state: string; changes: string[]; alternatives: Screening[] }[];
    const moved = saved.find((s) => s.screeningId === byTime('18:00').id)!;
    const gone = saved.find((s) => s.screeningId === byTime('21:00').id)!;
    expect(moved.state).toBe('changed');
    expect(moved.changes[0]).toBe('Time moved from 24 Nov, 6:00 pm to 24 Nov, 6:30 pm');
    expect(gone.state).toBe('removed');
    expect(gone.alternatives.map((a) => a.startsAt)).toContain('2026-11-24T23:00');
    feed.state.shows = [];
    await call('POST', '/api/admin/refresh/chennai', ad.cookie);
  });

  it('keeps an admin correction, alias removal and merge through re-sync and refresh, with an audit trail', async () => {
    const ad = await admin();
    const u = await signUp();
    await call('PUT', '/api/me/favourites/hyd-inox-gvk', u.cookie);
    expect((await call('PATCH', '/api/admin/cinemas/hyd-pvr-atrium', ad.cookie, { name: 'PVR Atrium Corrected', neighbourhood: 'Gachibowli West' })).statusCode).toBe(200);
    await call('POST', '/api/admin/cinemas/hyd-pvr-atrium/aliases', ad.cookie, { alias: 'Atrium Gachibowli' });
    await call('POST', '/api/admin/cinemas/hyd-pvr-atrium/aliases/remove', ad.cookie, { alias: 'Atrium' });
    expect((await call('POST', '/api/admin/cinemas/hyd-inox-gvk/merge', ad.cookie, { intoId: 'hyd-pvr-nexus' })).statusCode).toBe(204);

    await catalog.syncDirectory();
    await call('POST', '/api/admin/refresh/hyderabad', ad.cookie);
    const city = (await call('GET', '/api/discovery?city=hyderabad')).json() as DiscoveryPayload;
    const atrium = city.cinemas.find((c: Cinema) => c.id === 'hyd-pvr-atrium')!;
    expect(atrium.name).toBe('PVR Atrium Corrected');
    expect(atrium.neighbourhood).toBe('Gachibowli West');
    expect(atrium.aliases).toContain('Atrium Gachibowli');
    expect(atrium.aliases).not.toContain('Atrium');
    expect(city.cinemas.some((c: Cinema) => c.id === 'hyd-inox-gvk')).toBe(false);
    expect((await call('GET', '/api/cinemas/hyd-inox-gvk')).json().cinema.id).toBe('hyd-pvr-nexus');
    expect((await call('GET', '/api/me/library', u.cookie)).json().favourites[0].id).toBe('hyd-pvr-nexus');
    const audit = (await call('GET', '/api/admin/overview', ad.cookie)).json().audit as { actorEmail: string; action: string; entityId: string }[];
    expect(audit.find((a) => a.action === 'correct' && a.entityId === 'hyd-pvr-atrium')?.actorEmail).toBe(ad.email);
    expect(audit.some((a) => a.action === 'merge')).toBe(true);
  });

  it('won’t mark an auditorium verified without a source, or merge across cities', async () => {
    const ad = await admin();
    const body = { cinemaId: 'mum-pvr-palladium', name: 'Screen 2', modelId: 'scope-14m', verification: 'verified' };
    expect((await call('PUT', '/api/admin/auditoriums/mum-s2', ad.cookie, body)).statusCode).toBe(400);
    expect((await call('PUT', '/api/admin/auditoriums/mum-s2', ad.cookie, { ...body, note: 'Survey 2026' })).statusCode).toBe(204);
    expect((await call('GET', '/api/auditoriums/mum-s2')).json().auditorium.verification).toBe('verified');
    expect((await call('POST', '/api/admin/cinemas/mum-pvr-palladium/merge', ad.cookie, { intoId: 'koc-pvr-lulu' })).statusCode).toBe(400);
  });

  it('imports a local ticket once, only for its owner', async () => {
    const owner = await signUp();
    const other = await signUp();
    const event = DEMO_SCREENINGS.find((s) => s.id === 'cin-2145')!.id;
    const avail = await booking.getAvailability(event);
    const seat = seatIdsFor(event)!.find((s) => !avail.sold.has(s) && !avail.heldByOthers.has(s))!;
    const hold = await booking.hold(event, [seat]);
    const b = await booking.confirm(hold.id, { name: 'Owner', email: owner.email });
    const t = [{ reference: b.reference, email: owner.email }];
    expect((await call('POST', '/api/me/import', other.cookie, { tickets: t })).json().results[0].result).toBe('not-verified');
    expect((await call('POST', '/api/me/import', other.cookie, { tickets: [{ reference: b.reference, email: other.email }] })).json().results[0].result).toBe('not-verified');
    expect((await call('POST', '/api/me/import', owner.cookie, { tickets: [...t, ...t] })).json().results).toEqual([{ reference: b.reference, result: 'added' }]);
    expect((await call('POST', '/api/me/import', owner.cookie, { tickets: t })).json().results[0].result).toBe('already-added');
    expect((await call('GET', '/api/me/library', owner.cookie)).json().demoTickets).toEqual([b.reference]);
    expect((await call('GET', '/api/me/library', other.cookie)).json().demoTickets).toEqual([]);
  });

  it('offers a dismissible rating only after the show', async () => {
    const u = await signUp();
    await call('PUT', '/api/me/saved/cin-1900', u.cookie);
    expect((await call('POST', '/api/me/saved/cin-1900/rating', u.cookie, { score: 4 })).statusCode).toBe(409);
    clock = new Date('2026-11-29T00:00:00Z');
    expect((await call('GET', '/api/me/library', u.cookie)).json().saved[0].canRate).toBe(true);
    await call('POST', '/api/me/saved/cin-1900/dismiss-rating', u.cookie);
    expect((await call('GET', '/api/me/library', u.cookie)).json().saved[0].canRate).toBe(false);
    expect((await call('POST', '/api/me/saved/cin-1900/rating', u.cookie, { score: 4 })).statusCode).toBe(204);
    expect((await call('GET', '/api/me/library', u.cookie)).json().saved[0].rating).toBe(4);
  });
});
