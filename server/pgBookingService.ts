import { randomUUID } from 'node:crypto';
import { EVENTS } from '../src/booking/catalog';
import { normalizeCustomer } from '../src/booking/customer';
import { mockSoldSeats, newReference } from '../src/booking/mockSales';
import { BookingError, type Availability, type Booking, type BookingService, type Hold } from '../src/booking/types';
import type { Db, Sql } from './db';

export interface PgServiceOptions {
  seatIdsFor: (eventId: string) => string[] | undefined;
  priceFor: (eventId: string, seatIds: string[]) => { totalMinor: number; currency: string };
  /** Clock, injectable for tests. */
  now?: () => number;
  holdMs?: number;
  maxSeats?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * BookingService backed by PostgreSQL. Same contract and error codes as LocalBookingService.
 * Concurrency safety comes from the seat_claims primary key: claims are inserted with
 * ON CONFLICT DO NOTHING inside a transaction, and any seat that did not insert is reported
 * as unavailable and the whole transaction rolls back.
 */
export class PgBookingService implements BookingService {
  private readonly now: () => number;
  private readonly holdMs: number;
  private readonly maxSeats: number;
  private seatSets = new Map<string, Set<string>>();

  constructor(
    private db: Db,
    private opts: PgServiceOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.holdMs = opts.holdMs ?? 10 * 60 * 1000;
    this.maxSeats = opts.maxSeats ?? 10;
  }

  /** Inserts the deterministic mock "sold" seats for every catalog event (once). */
  /**
   * Seeds the deterministic mock "already sold" seats for every catalog event, and re-syncs them
   * when a venue's layout (and so its seat ids) has changed since the last start. Only the mock
   * claims are replaced; real bookings and holds are never touched. Returns, per event, whether the
   * mock seats were (re)seeded and how many real claims point at seat ids that no longer exist.
   */
  async seedMockSales(): Promise<{ eventId: string; reseeded: boolean; orphanedRealClaims: number }[]> {
    const report: { eventId: string; reseeded: boolean; orphanedRealClaims: number }[] = [];
    for (const ev of EVENTS) {
      const ref = `MOCK-${ev.id}`;
      const ids = this.opts.seatIdsFor(ev.id);
      if (!ids) continue;
      const expected = mockSoldSeats(ev.id, ids);
      const result = await this.db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO bookings (reference, event_id, total_minor, currency, created_at, is_mock)
           VALUES ($1, $2, 0, $3, to_timestamp($4 / 1000.0), true)
           ON CONFLICT (reference) DO NOTHING`,
          [ref, ev.id, ev.currency, this.now()],
        );
        const { rows: current } = await tx.query<{ seat_id: string }>(
          'SELECT seat_id FROM seat_claims WHERE event_id = $1 AND booking_ref = $2',
          [ev.id, ref],
        );
        const have = new Set(current.map((r) => r.seat_id));
        const inSync = have.size === expected.length && expected.every((s) => have.has(s));
        if (!inSync) {
          await tx.query('DELETE FROM seat_claims WHERE event_id = $1 AND booking_ref = $2', [ev.id, ref]);
          await tx.query(
            `INSERT INTO seat_claims (event_id, seat_id, booking_ref)
             SELECT $1, s, $2 FROM unnest($3::text[]) AS s
             ON CONFLICT DO NOTHING`,
            [ev.id, ref, expected],
          );
        }
        const { rows: orphans } = await tx.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM seat_claims
           WHERE event_id = $1 AND booking_ref IS DISTINCT FROM $2 AND NOT (seat_id = ANY($3::text[]))`,
          [ev.id, ref, ids],
        );
        return { reseeded: !inSync, orphanedRealClaims: orphans[0]!.n };
      });
      report.push({ eventId: ev.id, ...result });
    }
    return report;
  }

  async getAvailability(eventId: string, ownHoldId?: string): Promise<Availability> {
    this.seatSet(eventId);
    await this.sweep(this.db);
    const { rows } = await this.db.query<{ seat_id: string; booking_ref: string | null; hold_id: string | null }>(
      'SELECT seat_id, booking_ref, hold_id FROM seat_claims WHERE event_id = $1',
      [eventId],
    );
    const sold = new Set<string>();
    const heldByOthers = new Set<string>();
    for (const r of rows) {
      if (r.booking_ref) sold.add(r.seat_id);
      else if (r.hold_id !== ownHoldId) heldByOthers.add(r.seat_id);
    }
    return { sold, heldByOthers };
  }

  async hold(eventId: string, seatIds: string[], existingHoldId?: string): Promise<Hold> {
    const all = this.seatSet(eventId);
    const unique = [...new Set(seatIds)];
    if (unique.length === 0) throw new BookingError('EMPTY_HOLD', 'Select at least one seat.');
    if (unique.length > this.maxSeats) {
      throw new BookingError('TOO_MANY_SEATS', `A booking can hold at most ${this.maxSeats} seats.`);
    }
    const unknown = unique.filter((s) => !all.has(s));
    if (unknown.length) throw new BookingError('UNKNOWN_SEAT', 'Unknown seat.', unknown);
    if (existingHoldId && !UUID_RE.test(existingHoldId)) {
      throw new BookingError('HOLD_EXPIRED', 'Your hold has expired.');
    }

    return this.db.transaction(async (tx) => {
      await this.sweep(tx);
      let hold: { id: string; expiresAt: number };
      if (existingHoldId) {
        const { rows } = await tx.query<{ id: string; expires_ms: string }>(
          `SELECT id, (extract(epoch FROM expires_at) * 1000)::bigint AS expires_ms
           FROM holds WHERE id = $1 AND event_id = $2 FOR UPDATE`,
          [existingHoldId, eventId],
        );
        if (!rows[0]) throw new BookingError('HOLD_EXPIRED', 'Your hold has expired.');
        hold = { id: rows[0].id, expiresAt: Number(rows[0].expires_ms) };
        await tx.query('DELETE FROM seat_claims WHERE hold_id = $1 AND NOT (seat_id = ANY($2::text[]))', [
          hold.id,
          unique,
        ]);
      } else {
        hold = { id: randomUUID(), expiresAt: this.now() + this.holdMs };
        await tx.query(
          `INSERT INTO holds (id, event_id, expires_at, created_at)
           VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0))`,
          [hold.id, eventId, hold.expiresAt, this.now()],
        );
      }

      const { rows: mine } = await tx.query<{ seat_id: string }>(
        'SELECT seat_id FROM seat_claims WHERE hold_id = $1',
        [hold.id],
      );
      const already = new Set(mine.map((r) => r.seat_id));
      const wanted = unique.filter((s) => !already.has(s));
      const { rows: got } = await tx.query<{ seat_id: string }>(
        `INSERT INTO seat_claims (event_id, seat_id, hold_id)
         SELECT $1, s, $2 FROM unnest($3::text[]) AS s
         ON CONFLICT DO NOTHING RETURNING seat_id`,
        [eventId, hold.id, wanted],
      );
      if (got.length < wanted.length) {
        const ok = new Set(got.map((r) => r.seat_id));
        throw new BookingError(
          'SEAT_UNAVAILABLE',
          'Seat no longer available.',
          wanted.filter((s) => !ok.has(s)),
        );
      }
      return { id: hold.id, eventId, seatIds: unique, expiresAt: hold.expiresAt };
    });
  }

  async release(holdId: string): Promise<void> {
    if (!UUID_RE.test(holdId)) return;
    await this.db.query('DELETE FROM holds WHERE id = $1', [holdId]);
  }

  async confirm(holdId: string, customerInput: { name: string; email: string }): Promise<Booking> {
    if (!UUID_RE.test(holdId)) throw new BookingError('HOLD_EXPIRED', 'Your hold has expired.');
    const customer = normalizeCustomer(customerInput);
    return this.db.transaction(async (tx) => {
      await this.sweep(tx);
      const { rows } = await tx.query<{ event_id: string }>('SELECT event_id FROM holds WHERE id = $1 FOR UPDATE', [
        holdId,
      ]);
      if (!rows[0]) {
        // Idempotent retry (double click, network drop after commit): return the original booking.
        const previous = await this.bookingForHold(tx, holdId);
        if (previous) return previous;
        throw new BookingError('HOLD_EXPIRED', 'Your hold has expired.');
      }
      const eventId = rows[0].event_id;
      const { rows: seatRows } = await tx.query<{ seat_id: string }>(
        'SELECT seat_id FROM seat_claims WHERE hold_id = $1 ORDER BY seat_id',
        [holdId],
      );
      const seatIds = seatRows.map((r) => r.seat_id);
      if (seatIds.length === 0) throw new BookingError('EMPTY_HOLD', 'Select at least one seat.');
      const { totalMinor, currency } = this.opts.priceFor(eventId, seatIds);
      const createdAt = this.now();
      const reference = newReference();
      await tx.query(
        `INSERT INTO bookings (reference, event_id, total_minor, currency, created_at, hold_id, customer_name, customer_email)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7, $8)`,
        [reference, eventId, totalMinor, currency, createdAt, holdId, customer.name, customer.email],
      );
      await tx.query('UPDATE seat_claims SET booking_ref = $1, hold_id = NULL WHERE hold_id = $2', [
        reference,
        holdId,
      ]);
      await tx.query('DELETE FROM holds WHERE id = $1', [holdId]);
      return { reference, customer, eventId, seatIds, totalMinor, currency, createdAt };
    });
  }

  private seatSet(eventId: string): Set<string> {
    let set = this.seatSets.get(eventId);
    if (!set) {
      const ids = this.opts.seatIdsFor(eventId);
      if (!ids) throw new BookingError('UNKNOWN_EVENT', `Unknown event ${eventId}.`);
      set = new Set(ids);
      this.seatSets.set(eventId, set);
    }
    return set;
  }

  async findBooking(reference: string, email: string): Promise<Booking | null> {
    const ref = reference.trim().toUpperCase();
    if (!/^SV-[A-Z2-9]{6}$/.test(ref)) return null;
    const { rows } = await this.db.query<{ hold_id: string | null; customer_email: string | null }>(
      'SELECT hold_id::text, customer_email FROM bookings WHERE reference = $1 AND NOT is_mock',
      [ref],
    );
    const row = rows[0];
    // Same answer for "no such booking" and "wrong email", so references cannot be probed by email.
    if (!row || !row.hold_id || row.customer_email !== email.trim().toLowerCase()) return null;
    return this.bookingForHold(this.db, row.hold_id);
  }

  /** Background sweep (run on an interval by the server); returns the number of holds removed. */
  async sweepExpired(): Promise<number> {
    return this.sweep(this.db);
  }

  /** Readiness probe: throws if the database cannot answer. */
  async ping(): Promise<void> {
    await this.db.query('SELECT 1');
  }

  private async bookingForHold(sql: Sql, holdId: string): Promise<Booking | null> {
    const { rows } = await sql.query<{
      reference: string;
      event_id: string;
      total_minor: number;
      currency: string;
      created_ms: string;
      customer_name: string | null;
      customer_email: string | null;
    }>(
      `SELECT reference, event_id, total_minor, currency, customer_name, customer_email,
              (extract(epoch FROM created_at) * 1000)::bigint AS created_ms
       FROM bookings WHERE hold_id = $1`,
      [holdId],
    );
    const b = rows[0];
    if (!b) return null;
    const { rows: seats } = await sql.query<{ seat_id: string }>(
      'SELECT seat_id FROM seat_claims WHERE booking_ref = $1 ORDER BY seat_id',
      [b.reference],
    );
    return {
      reference: b.reference,
      ...(b.customer_name && b.customer_email ? { customer: { name: b.customer_name, email: b.customer_email } } : {}),
      eventId: b.event_id,
      seatIds: seats.map((s) => s.seat_id),
      totalMinor: b.total_minor,
      currency: b.currency.trim(),
      createdAt: Number(b.created_ms),
    };
  }

  /** Deletes expired holds; their seat claims cascade. */
  private async sweep(sql: Sql): Promise<number> {
    const { rows } = await sql.query('DELETE FROM holds WHERE expires_at <= to_timestamp($1 / 1000.0) RETURNING id', [
      this.now(),
    ]);
    return rows.length;
  }
}
