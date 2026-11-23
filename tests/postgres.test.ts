import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockSoldSeats } from '../src/booking/mockSales';
import { BookingError } from '../src/booking/types';
import { priceFor, seatIdsFor } from '../src/booking/venues';
import type { Db } from '../server/db';
import { migrate } from '../server/migrate';
import { PgBookingService } from '../server/pgBookingService';
import { assertThrowawayDatabase, extraConnection, freshDb, usingPostgres } from './testDb';

/**
 * Tests that need a real multi-connection PostgreSQL server (PGlite has one connection, so
 * transactions there never truly overlap). Skipped unless TEST_DATABASE_URL is set.
 */
const EVENT = 'cin-1900';
const free = (() => {
  const all = seatIdsFor(EVENT)!;
  const sold = new Set(mockSoldSeats(EVENT, all));
  return all.filter((s) => !sold.has(s));
})();

describe('test database guard', () => {
  it('refuses databases whose name does not end in _test', () => {
    expect(() => assertThrowawayDatabase('postgres://u:p@localhost:5432/seatview')).toThrow(/_test/);
    expect(() => assertThrowawayDatabase('postgres://u:p@localhost:5432/seatview_test')).not.toThrow();
  });
});

describe.skipIf(!usingPostgres)('real PostgreSQL: concurrency across connections', () => {
  const CONNECTIONS = 8;
  let main: Db;
  const pools: Db[] = [];
  const services: PgBookingService[] = [];

  beforeAll(async () => {
    main = await freshDb();
    await migrate(main);
    await new PgBookingService(main, { seatIdsFor, priceFor }).seedMockSales();
    for (let i = 0; i < CONNECTIONS; i++) {
      const db = await extraConnection();
      pools.push(db);
      services.push(new PgBookingService(db, { seatIdsFor, priceFor }));
    }
  });
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.close()));
    await main?.close();
  });

  const settle = <T>(ps: Promise<T>[]) => Promise.allSettled(ps);

  it('40 customers on 8 connection pools race for one seat: exactly one wins', async () => {
    const seat = free[0]!;
    const results = await settle(Array.from({ length: 40 }, (_, i) => services[i % CONNECTIONS]!.hold(EVENT, [seat])));
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(39);
    for (const l of lost) expect((l.reason as BookingError).code).toBe('SEAT_UNAVAILABLE');
    const { rows } = await main.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM seat_claims WHERE event_id = $1 AND seat_id = $2',
      [EVENT, seat],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('overlapping multi-seat requests are all-or-nothing and never double-claim', async () => {
    const pool = free.slice(10, 16); // 6 seats
    // 30 requests, each for 3 of the 6 seats (overlapping windows), fired at once.
    const requests = Array.from({ length: 30 }, (_, i) => [pool[i % 6]!, pool[(i + 1) % 6]!, pool[(i + 2) % 6]!]);
    const results = await settle(requests.map((seats, i) => services[i % CONNECTIONS]!.hold(EVENT, seats)));
    const holds = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    expect(holds.length).toBeGreaterThanOrEqual(1);
    expect(holds.length).toBeLessThanOrEqual(2); // 6 seats / 3 per request
    // Each successful hold owns all of its seats; no seat is in two holds.
    const owned = holds.flatMap((h) => h.seatIds);
    expect(new Set(owned).size).toBe(owned.length);
    const { rows } = await main.query<{ seat_id: string; hold_id: string }>(
      'SELECT seat_id, hold_id::text FROM seat_claims WHERE event_id = $1 AND seat_id = ANY($2::text[])',
      [EVENT, pool],
    );
    expect(rows.length).toBe(owned.length);
    for (const h of holds) {
      expect(rows.filter((r) => r.hold_id === h.id).map((r) => r.seat_id).sort()).toEqual([...h.seatIds].sort());
    }
    // Failed requests left nothing behind.
    const { rows: orphanHolds } = await main.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM holds h WHERE NOT EXISTS (SELECT 1 FROM seat_claims c WHERE c.hold_id = h.id)',
    );
    expect(orphanHolds[0]!.n).toBe(0);
  });

  it('the same hold confirmed from 8 connections at once yields one booking', async () => {
    const h = await services[0]!.hold(EVENT, free.slice(20, 22));
    const results = await settle(services.map((s) => s.confirm(h.id, { name: 'Test Customer', email: 'test@example.com' })));
    const bookings = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    expect(bookings).toHaveLength(CONNECTIONS);
    expect(new Set(bookings.map((b) => b.reference)).size).toBe(1);
    const { rows } = await main.query<{ n: number }>('SELECT count(*)::int AS n FROM bookings WHERE hold_id = $1', [h.id]);
    expect(rows[0]!.n).toBe(1);
  });

  it('a seat held on one connection is visible as held on another', async () => {
    const seat = free[30]!;
    const h = await services[1]!.hold(EVENT, [seat]);
    expect((await services[5]!.getAvailability(EVENT)).heldByOthers.has(seat)).toBe(true);
    await services[6]!.release(h.id);
    expect((await services[2]!.getAvailability(EVENT)).heldByOthers.has(seat)).toBe(false);
  });
});

describe.skipIf(!usingPostgres)('real PostgreSQL: migrations', () => {
  it('two servers starting at once: each migration applied exactly once, no errors', async () => {
    const reset = await freshDb(); // empty schema
    await reset.close();
    const [a, b, c] = await Promise.all([extraConnection(), extraConnection(), extraConnection()]);
    const results = await Promise.all([migrate(a!), migrate(b!), migrate(c!)]);
    expect(results.flat().sort((x, y) => x - y)).toEqual([1, 2, 3, 4]); // applied once in total, by whichever got the lock
    const { rows } = await a!.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4]);
    await Promise.all([a!.close(), b!.close(), c!.close()]);
  });
});
