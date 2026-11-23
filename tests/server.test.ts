import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockSoldSeats } from '../src/booking/mockSales';
import { priceFor, seatIdsFor } from '../src/booking/venues';
import { buildApp } from '../server/app';
import type { Db } from '../server/db';
import { migrate } from '../server/migrate';
import { PgBookingService } from '../server/pgBookingService';
import { freshDb } from './testDb';

// Integration tests: real SQL against an in-memory PGlite (embedded PostgreSQL), through the HTTP layer.
const EVENT = 'cin-1900';
const CUSTOMER = { name: '  Asha   Rao ', email: ' Asha.Rao@Example.COM ' };
let db: Db;
let app: FastifyInstance;
const clock = { t: Date.UTC(2026, 10, 28, 18, 0, 0) };

const allSeats = seatIdsFor(EVENT)!;
const mockSold = new Set(mockSoldSeats(EVENT, allSeats));
const free = allSeats.filter((s) => !mockSold.has(s));
let next = 0;
const takeFree = (n: number) => free.slice(next, (next += n));

beforeAll(async () => {
  db = await freshDb();
  await migrate(db);
  const service = new PgBookingService(db, { seatIdsFor, priceFor, now: () => clock.t });
  await service.seedMockSales();
  await service.seedMockSales(); // idempotent
  app = buildApp(service);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

beforeEach(() => {
  clock.t += 60 * 60 * 1000; // isolate tests in time; earlier holds expire
});

const hold = (body: object) => app.inject({ method: 'POST', url: '/api/holds', payload: body });
const avail = async (holdId?: string) =>
  (await app.inject({ url: `/api/events/${EVENT}/availability${holdId ? `?holdId=${holdId}` : ''}` })).json() as {
    sold: string[];
    heldByOthers: string[];
  };

describe('schema and seed', () => {
  it('migrate is idempotent and mock sales are seeded once per event', async () => {
    await migrate(db);
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM seat_claims WHERE event_id = $1 AND booking_ref = 'MOCK-cin-1900'",
      [EVENT],
    );
    expect(rows[0]!.n).toBe(mockSold.size);
    expect(new Set((await avail()).sold)).toEqual(mockSold);
  });

  it('the database refuses a second claim on the same seat (primary key)', async () => {
    const seat = [...mockSold][0]!;
    await expect(
      db.query("INSERT INTO seat_claims (event_id, seat_id, booking_ref) VALUES ($1, $2, 'MOCK-cin-1900')", [EVENT, seat]),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('REST API', () => {
  it('GET /api/events lists the catalog', async () => {
    const r = await app.inject({ url: '/api/events' });
    expect(r.statusCode).toBe(200);
    const ids = r.json().map((e: { id: string }) => e.id);
    expect(ids.length).toBe(21);
    for (const id of ['cin-1900', 'cin-2145', 'sta-match', 'arena-game', 'cricket-odi']) expect(ids).toContain(id); // ids kept stable for existing bookings
    expect(new Set(r.json().map((e: { currency: string }) => e.currency))).toEqual(new Set(['INR']));
  });

  it('hold → availability → confirm → sold', async () => {
    const seats = takeFree(2);
    const h = await hold({ eventId: EVENT, seatIds: seats });
    expect(h.statusCode).toBe(201);
    const held = h.json();
    expect(held.seatIds).toEqual(seats);
    expect(held.expiresAt).toBe(clock.t + 10 * 60 * 1000);

    expect((await avail()).heldByOthers).toEqual(expect.arrayContaining(seats));
    expect((await avail(held.id)).heldByOthers).not.toContain(seats[0]);

    const c = await app.inject({ method: 'POST', url: `/api/holds/${held.id}/confirm`, payload: { customer: CUSTOMER } });
    expect(c.statusCode).toBe(201);
    const booking = c.json();
    expect(booking.reference).toMatch(/^SV-[A-Z2-9]{6}$/);
    expect(booking.customer).toEqual({ name: 'Asha Rao', email: 'asha.rao@example.com' });
    const stored = await db.query<{ customer_name: string; customer_email: string }>(
      'SELECT customer_name, customer_email FROM bookings WHERE reference = $1',
      [booking.reference],
    );
    expect(stored.rows[0]).toEqual({ customer_name: 'Asha Rao', customer_email: 'asha.rao@example.com' });
    expect(booking.totalMinor).toBe(priceFor(EVENT, seats).totalMinor);
    expect([...booking.seatIds].sort()).toEqual([...seats].sort());
    expect((await avail()).sold).toEqual(expect.arrayContaining(seats));

    // Retried confirm (double click / network drop) returns the same booking.
    const again = await app.inject({ method: 'POST', url: `/api/holds/${held.id}/confirm`, payload: { customer: CUSTOMER } });
    expect(again.statusCode).toBe(201);
    expect(again.json()).toEqual(booking);
  });

  it('updating a hold adds/removes seats and keeps id and expiry', async () => {
    const [a, b, c] = takeFree(3);
    const h1 = (await hold({ eventId: EVENT, seatIds: [a, b] })).json();
    clock.t += 30_000;
    const r = await hold({ eventId: EVENT, seatIds: [b, c], holdId: h1.id });
    expect(r.statusCode).toBe(200);
    const h2 = r.json();
    expect(h2.id).toBe(h1.id);
    expect(h2.expiresAt).toBe(h1.expiresAt);
    const others = (await avail()).heldByOthers;
    expect(others).toEqual(expect.arrayContaining([b, c]));
    expect(others).not.toContain(a);
  });

  it('409 with the conflicting seats when a seat is sold or held', async () => {
    const [x, y] = takeFree(2);
    await hold({ eventId: EVENT, seatIds: [x] });
    const soldSeat = [...mockSold][1]!;
    const r = await hold({ eventId: EVENT, seatIds: [x, y, soldSeat] });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ code: 'SEAT_UNAVAILABLE' });
    expect(r.json().seatIds.sort()).toEqual([x, soldSeat].sort());
    // Rolled back: y was not left claimed by the failed request.
    expect((await avail()).heldByOthers).not.toContain(y);
  });

  it('concurrent holds on the same seat: exactly one wins', async () => {
    const [s] = takeFree(1);
    const results = await Promise.all(Array.from({ length: 8 }, () => hold({ eventId: EVENT, seatIds: [s] })));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(7);
  });

  it('expired holds release their seats and cannot be confirmed', async () => {
    const [s] = takeFree(1);
    const h = (await hold({ eventId: EVENT, seatIds: [s] })).json();
    clock.t += 10 * 60 * 1000;
    expect((await avail()).heldByOthers).not.toContain(s);
    const c = await app.inject({ method: 'POST', url: `/api/holds/${h.id}/confirm`, payload: { customer: CUSTOMER } });
    expect(c.statusCode).toBe(410);
    const r = await hold({ eventId: EVENT, seatIds: [s] }); // someone else can now take it
    expect(r.statusCode).toBe(201);
  });

  it('confirm requires valid contact details; nothing is booked otherwise', async () => {
    const [s] = takeFree(1);
    const h = (await hold({ eventId: EVENT, seatIds: [s] })).json();
    const url = `/api/holds/${h.id}/confirm`;
    expect((await app.inject({ method: 'POST', url })).statusCode).toBe(400); // no body
    const bad = await app.inject({ method: 'POST', url, payload: { customer: { name: ' ', email: 'not-an-email' } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('INVALID_CUSTOMER');
    expect(bad.json().message).toMatch(/name/i);
    expect(bad.json().message).toMatch(/email/i);
    expect((await avail()).sold).not.toContain(s); // still only held
    const ok = await app.inject({ method: 'POST', url, payload: { customer: CUSTOMER } });
    expect(ok.statusCode).toBe(201);
  });

  it('booking lookup needs the matching email; wrong email and unknown reference look identical', async () => {
    const [s] = takeFree(1);
    const h = (await hold({ eventId: EVENT, seatIds: [s] })).json();
    const b = (await app.inject({ method: 'POST', url: `/api/holds/${h.id}/confirm`, payload: { customer: CUSTOMER } })).json();
    const ok = await app.inject({ url: `/api/bookings/${b.reference.toLowerCase()}?email=${encodeURIComponent(' ASHA.RAO@example.com ')}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().seatIds).toEqual([s]);
    expect(ok.headers['cache-control']).toBe('no-store');
    const wrong = await app.inject({ url: `/api/bookings/${b.reference}?email=someone@example.com` });
    const missing = await app.inject({ url: '/api/bookings/SV-ZZZZZZ?email=asha.rao@example.com' });
    expect(wrong.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(wrong.body).toBe(missing.body);
    expect((await app.inject({ url: `/api/bookings/${b.reference}` })).statusCode).toBe(400); // email required
    expect((await app.inject({ url: '/api/bookings/MOCK-cin-1900?email=x@y.z' })).statusCode).toBe(404); // mock sales never exposed
  });

  it('availability never exposes customer data', async () => {
    const body = JSON.stringify(await avail());
    expect(body).not.toMatch(/@|Asha/i);
  });

  it('DELETE releases a hold', async () => {
    const [s] = takeFree(1);
    const h = (await hold({ eventId: EVENT, seatIds: [s] })).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/holds/${h.id}` })).statusCode).toBe(204);
    expect((await avail()).heldByOthers).not.toContain(s);
  });

  it('validation and error codes', async () => {
    expect((await hold({ eventId: EVENT })).statusCode).toBe(400); // missing seatIds
    expect((await hold({ eventId: EVENT, seatIds: [] })).json().code).toBe('EMPTY_HOLD');
    expect((await hold({ eventId: EVENT, seatIds: ['Z99'] })).json().code).toBe('UNKNOWN_SEAT');
    expect((await hold({ eventId: EVENT, seatIds: takeFree(11) })).json().code).toBe('TOO_MANY_SEATS');
    expect((await hold({ eventId: 'nope', seatIds: ['A1'] })).statusCode).toBe(404); // valid shape, unknown event
    expect((await hold({ eventId: EVENT, seatIds: takeFree(1), holdId: 'not-a-uuid' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/holds/not-a-uuid/confirm', payload: { customer: CUSTOMER } })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/events/BAD%20ID/availability' })).statusCode).toBe(400);
    expect((await hold({ eventId: EVENT, seatIds: ['<script>'] })).statusCode).toBe(400);
    expect((await hold({ eventId: EVENT, seatIds: [{ id: 'A1' }] })).statusCode).toBe(400); // wrong type
    // Fastify's validator defaults: unknown body fields are stripped (removeAdditional) and a lone
    // string is coerced to a one-element array (coerceTypes: 'array'); neither is rejected.
  });

  it('stadium event works with its 46k-seat inventory', async () => {
    const ids = seatIdsFor('sta-match')!;
    const sold = new Set(mockSoldSeats('sta-match', ids));
    const seat = ids.find((s) => !sold.has(s))!;
    const r = await hold({ eventId: 'sta-match', seatIds: [seat] });
    expect(r.statusCode).toBe(201);
    const a = (await app.inject({ url: '/api/events/sta-match/availability' })).json();
    expect(a.sold.length).toBe(sold.size);
  });
});
