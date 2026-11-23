import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/booking/catalog';
import { LocalBookingService } from '../src/booking/localService';
import { cinemaCategories, stadiumCategories, totalMinor } from '../src/booking/pricing';
import { BookingError } from '../src/booking/types';
import { buildCinemaLayout } from '../src/engine/cinema/layout';
import { DEMO_SCOPE_HALL } from '../src/engine/cinema/params';
import { buildStadiumLayout } from '../src/engine/stadium/layout';
import { DEMO_FOOTBALL_STADIUM } from '../src/engine/stadium/params';

const cinema = buildCinemaLayout(DEMO_SCOPE_HALL);
const cinemaCats = cinemaCategories(cinema);
const ev = EVENTS.find((e) => e.id === 'cin-1900')!;
const seatIds = cinema.seats.map((s) => s.id);

function makeService(clock = { t: 1_000_000 }, storage: Map<string, string> | null = null) {
  return new LocalBookingService({
    seatIdsFor: (id) => (EVENTS.some((e) => e.id === id && e.venue === 'cinema') ? seatIds : undefined),
    priceFor: (_id, ids) => ({ totalMinor: totalMinor(ev, cinemaCats, ids), currency: ev.currency }),
    now: () => clock.t,
    storage: storage && { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) },
  });
}

async function freeSeats(svc: LocalBookingService, n: number) {
  const { sold } = await svc.getAvailability('cin-1900');
  return seatIds.filter((s) => !sold.has(s)).slice(0, n);
}

describe('pricing', () => {
  it('cinema rows map to front / standard / premium', () => {
    expect(cinemaCats.get('A1')).toBe('front');
    expect(cinemaCats.get('C24')).toBe('front');
    expect(cinemaCats.get('D1')).toBe('standard');
    expect(cinemaCats.get('K12')).toBe('standard');
    expect(cinemaCats.get('L12')).toBe('premium');
  });
  it('totals in minor units', () => {
    expect(totalMinor(ev, cinemaCats, ['A1', 'D1', 'L1'])).toBe(18000 + 25000 + 35000); // ₹180 + ₹250 + ₹350
  });
  it('stadium categories by tier and segment', () => {
    const st = buildStadiumLayout(DEMO_FOOTBALL_STADIUM);
    const cats = stadiumCategories(st);
    expect(cats.get('103-17-35')).toBe('cat1'); // lower, side
    expect(cats.get('108-13-1')).toBe('cat2'); // lower, corner
    expect(cats.get('203-1-1')).toBe('cat3'); // upper, side
    expect(cats.get('208-20-20')).toBe('cat4'); // upper, corner
    expect(new Set(cats.values()).size).toBe(4);
  });
});

describe('LocalBookingService', () => {
  it('seeds the same sold seats on every instance (deterministic mock)', async () => {
    const a = await makeService().getAvailability('cin-1900');
    const b = await makeService().getAvailability('cin-1900');
    expect([...a.sold]).toEqual([...b.sold]);
    expect(a.sold.size / seatIds.length).toBeGreaterThan(0.2);
    expect(a.sold.size / seatIds.length).toBeLessThan(0.5);
  });

  it('holds free seats, and blocks them for other customers', async () => {
    const svc = makeService();
    const [s1, s2] = await freeSeats(svc, 2);
    const mine = await svc.hold('cin-1900', [s1!]);
    const other = await svc.getAvailability('cin-1900');
    expect(other.heldByOthers.has(s1!)).toBe(true);
    const own = await svc.getAvailability('cin-1900', mine.id);
    expect(own.heldByOthers.has(s1!)).toBe(false);
    await expect(svc.hold('cin-1900', [s1!, s2!])).rejects.toMatchObject({ code: 'SEAT_UNAVAILABLE', seatIds: [s1] });
  });

  it('rejects sold and unknown seats', async () => {
    const svc = makeService();
    const { sold } = await svc.getAvailability('cin-1900');
    const soldSeat = [...sold][0]!;
    await expect(svc.hold('cin-1900', [soldSeat])).rejects.toMatchObject({ code: 'SEAT_UNAVAILABLE' });
    await expect(svc.hold('cin-1900', ['Z99'])).rejects.toMatchObject({ code: 'UNKNOWN_SEAT' });
  });

  it('caps seats per hold at 10', async () => {
    const svc = makeService();
    await expect(svc.hold('cin-1900', await freeSeats(svc, 11))).rejects.toBeInstanceOf(BookingError);
  });

  it('updating a hold keeps the original expiry', async () => {
    const clock = { t: 1_000_000 };
    const svc = makeService(clock);
    const [s1, s2] = await freeSeats(svc, 2);
    const h1 = await svc.hold('cin-1900', [s1!]);
    clock.t += 60_000;
    const h2 = await svc.hold('cin-1900', [s1!, s2!], h1.id);
    expect(h2.id).toBe(h1.id);
    expect(h2.expiresAt).toBe(h1.expiresAt);
    expect(h2.expiresAt).toBe(1_000_000 + 10 * 60_000);
  });

  it('expired holds free their seats and cannot be confirmed', async () => {
    const clock = { t: 1_000_000 };
    const svc = makeService(clock);
    const [s1] = await freeSeats(svc, 1);
    const h = await svc.hold('cin-1900', [s1!]);
    clock.t += 10 * 60_000; // exactly at expiry
    expect((await svc.getAvailability('cin-1900')).heldByOthers.has(s1!)).toBe(false);
    await expect(svc.confirm(h.id, { name: 'Test Customer', email: 'test@example.com' })).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
    await expect(svc.hold('cin-1900', [s1!], h.id)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
  });

  it('confirm creates a priced booking, sells the seats and persists them', async () => {
    const storage = new Map<string, string>();
    const svc = makeService({ t: 1_000_000 }, storage);
    const seats = await freeSeats(svc, 3);
    const h = await svc.hold('cin-1900', seats);
    const b = await svc.confirm(h.id, { name: 'Test Customer', email: 'test@example.com' });
    expect(b.reference).toMatch(/^SV-[A-Z2-9]{6}$/);
    expect(b.totalMinor).toBe(totalMinor(ev, cinemaCats, seats));
    expect((await svc.getAvailability('cin-1900')).sold.has(seats[0]!)).toBe(true);
    // A fresh service reading the same storage sees the seats as sold.
    const reloaded = makeService({ t: 2_000_000 }, storage);
    expect((await reloaded.getAvailability('cin-1900')).sold.has(seats[0]!)).toBe(true);
    // ...but only for that event.
    expect((await reloaded.getAvailability('cin-2145')).sold.has(seats[0]!)).toBe(
      (await makeService().getAvailability('cin-2145')).sold.has(seats[0]!),
    );
  });

  it('release frees the seats immediately', async () => {
    const svc = makeService();
    const [s1] = await freeSeats(svc, 1);
    const h = await svc.hold('cin-1900', [s1!]);
    await svc.release(h.id);
    expect((await svc.getAvailability('cin-1900')).heldByOthers.size).toBe(0);
  });
});

describe('customer details', () => {
  it('normalises and validates', async () => {
    const { normalizeCustomer } = await import('../src/booking/customer');
    expect(normalizeCustomer({ name: '  Asha   Rao ', email: ' A@B.CO ' })).toEqual({ name: 'Asha Rao', email: 'a@b.co' });
    expect(() => normalizeCustomer({ name: '', email: 'a@b.co' })).toThrow(/name/);
    expect(() => normalizeCustomer({ name: 'A', email: 'a@b' })).toThrow(/email/);
    expect(() => normalizeCustomer({ name: 'x'.repeat(101), email: 'a@b.co' })).toThrow(/name/);
    expect(() => normalizeCustomer({ name: 'A\u0000B', email: 'a@b.co' })).toThrow(/name/);
    expect(() => normalizeCustomer(undefined)).toThrow(BookingError);
  });
  it('local service rejects bad details and keeps the hold', async () => {
    const svc = makeService();
    const [s1] = await freeSeats(svc, 1);
    const h = await svc.hold('cin-1900', [s1!]);
    await expect(svc.confirm(h.id, { name: '', email: 'x' })).rejects.toMatchObject({ code: 'INVALID_CUSTOMER' });
    const b = await svc.confirm(h.id, { name: 'Ok', email: 'ok@example.com' });
    expect(b.customer).toEqual({ name: 'Ok', email: 'ok@example.com' });
  });
});

describe('Phase 8 venues: arena and cricket pricing', () => {
  it('every seat of every venue has a category that exists in its event', async () => {
    const { categoriesFor, seatIdsFor } = await import('../src/booking/venues');
    for (const ev of EVENTS) {
      const cats = categoriesFor(ev.id)!;
      const ids = seatIdsFor(ev.id)!;
      expect(ids.length).toBeGreaterThan(300);
      const known = new Set(ev.categories.map((c) => c.id));
      for (const id of ids) expect(known.has(cats.get(id)!)).toBe(true);
    }
  });
  it('cricket: square of the wicket vs behind the bowler', async () => {
    const { bowlData } = await import('../src/booking/venues');
    const { layout, cats } = bowlData('cricket');
    const square = layout.seats.find((s) => s.rowIndex === 0 && Math.abs(s.plan.x) < 2)!; // on the +Z/−Z side
    const end = layout.seats.find((s) => s.rowIndex === 0 && Math.abs(s.plan.z) < 2)!; // behind the stumps
    expect(cats.get(square.id)).toBe('cat1');
    expect(cats.get(end.id)).toBe('cat2');
  });
});

describe('Phase 9 catalog (India)', () => {
  it('every session belongs to a listing, in INR, with unique ids', async () => {
    const { LISTINGS, listingForEvent, formatMoney } = await import('../src/booking/catalog');
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    for (const e of EVENTS) {
      expect(e.currency).toBe('INR');
      expect(listingForEvent(e.id)!.id).toBe(e.listingId);
    }
    expect(LISTINGS.filter((l) => l.kind === 'movie').length).toBeGreaterThanOrEqual(6);
    for (const k of ['cricket', 'football', 'basketball'] as const) {
      for (const l of LISTINGS.filter((x) => x.kind === k)) expect(l.home && l.away).toBeTruthy();
    }
    expect(formatMoney(450000, 'INR')).toBe('₹4,500');
    expect(formatMoney(18050, 'INR')).toBe('₹180.50');
  });
  it('local service finds a booking only with the matching email', async () => {
    const svc = makeService();
    const [s1] = await freeSeats(svc, 1);
    const h = await svc.hold('cin-1900', [s1!]);
    const b = await svc.confirm(h.id, { name: 'A', email: 'a@example.com' });
    expect(await svc.findBooking(b.reference.toLowerCase(), ' A@example.com ')).toEqual(b);
    expect(await svc.findBooking(b.reference, 'b@example.com')).toBeNull();
  });
});
