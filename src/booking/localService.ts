import { normalizeCustomer } from './customer';
import { MOCK_SOLD_RATIO, mockSoldSeats, newReference } from './mockSales';
import { BookingError, type Availability, type Booking, type BookingService, type Hold } from './types';

export interface LocalServiceOptions {
  /** All seat ids of the event's venue (to validate ids and seed mock sales). */
  seatIdsFor: (eventId: string) => string[] | undefined;
  /** Price total for a set of seats, in minor units, plus currency. */
  priceFor: (eventId: string, seatIds: string[]) => { totalMinor: number; currency: string };
  /** Clock, injectable for tests. */
  now?: () => number;
  /** Hold duration [assumed] 10 minutes. */
  holdMs?: number;
  /** Max seats per hold/booking [assumed]. */
  maxSeats?: number;
  /** Share of seats pre-sold by the mock, per event [assumed]. */
  soldRatio?: number;
  /** Persistence for confirmed bookings (localStorage in the browser, omitted in tests). */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Random source for ids, injectable for tests. */
  random?: () => number;
}

const STORAGE_KEY = 'seatview3d.bookings.v1';

/**
 * In-browser implementation of BookingService for the demo. It simulates a server:
 * seeded pre-sold seats, holds with expiry, conflict checks, and confirmation.
 * Holds live in memory; confirmed bookings persist to `storage` when given.
 */
export class LocalBookingService implements BookingService {
  private holds = new Map<string, Hold>();
  /** Hold id → booking it produced, so a retried confirm returns the same booking. */
  private confirmedByHold = new Map<string, Booking>();
  private seeded = new Map<string, Set<string>>();
  private bookings: Booking[] = [];
  private readonly now: () => number;
  private readonly holdMs: number;
  private readonly maxSeats: number;
  private readonly soldRatio: number;
  private readonly random: () => number;

  constructor(private opts: LocalServiceOptions) {
    this.now = opts.now ?? Date.now;
    this.holdMs = opts.holdMs ?? 10 * 60 * 1000;
    this.maxSeats = opts.maxSeats ?? 10;
    this.soldRatio = opts.soldRatio ?? MOCK_SOLD_RATIO;
    this.random = opts.random ?? Math.random;
    this.bookings = this.load();
  }

  async getAvailability(eventId: string, ownHoldId?: string): Promise<Availability> {
    this.requireEvent(eventId);
    this.purgeExpired();
    const heldByOthers = new Set<string>();
    for (const h of this.holds.values()) {
      if (h.eventId === eventId && h.id !== ownHoldId) h.seatIds.forEach((s) => heldByOthers.add(s));
    }
    return { sold: this.soldSet(eventId), heldByOthers };
  }

  async hold(eventId: string, seatIds: string[], existingHoldId?: string): Promise<Hold> {
    const all = new Set(this.requireEvent(eventId));
    this.purgeExpired();
    const unique = [...new Set(seatIds)];
    if (unique.length === 0) throw new BookingError('EMPTY_HOLD', 'Select at least one seat.');
    if (unique.length > this.maxSeats) {
      throw new BookingError('TOO_MANY_SEATS', `A booking can hold at most ${this.maxSeats} seats.`);
    }
    const unknown = unique.filter((s) => !all.has(s));
    if (unknown.length) throw new BookingError('UNKNOWN_SEAT', 'Unknown seat.', unknown);

    const existing = existingHoldId ? this.holds.get(existingHoldId) : undefined;
    if (existingHoldId && !existing) throw new BookingError('HOLD_EXPIRED', 'Your hold has expired.');

    const { sold, heldByOthers } = await this.getAvailability(eventId, existingHoldId);
    const taken = unique.filter((s) => sold.has(s) || heldByOthers.has(s));
    if (taken.length) throw new BookingError('SEAT_UNAVAILABLE', 'Seat no longer available.', taken);

    const hold: Hold = existing
      ? { ...existing, seatIds: unique }
      : { id: this.newId('H'), eventId, seatIds: unique, expiresAt: this.now() + this.holdMs };
    this.holds.set(hold.id, hold);
    return hold;
  }

  async release(holdId: string): Promise<void> {
    this.holds.delete(holdId);
  }

  async confirm(holdId: string, customerInput: { name: string; email: string }): Promise<Booking> {
    this.purgeExpired();
    const hold = this.holds.get(holdId);
    if (!hold) {
      const previous = this.confirmedByHold.get(holdId);
      if (previous) return previous;
      throw new BookingError('HOLD_EXPIRED', 'Your hold has expired.');
    }
    const customer = normalizeCustomer(customerInput);
    const { totalMinor, currency } = this.opts.priceFor(hold.eventId, hold.seatIds);
    const booking: Booking = {
      reference: newReference(this.random),
      customer,
      eventId: hold.eventId,
      seatIds: [...hold.seatIds],
      totalMinor,
      currency,
      createdAt: this.now(),
    };
    this.bookings.push(booking);
    this.confirmedByHold.set(holdId, booking);
    this.holds.delete(holdId);
    this.save();
    return booking;
  }

  async findBooking(reference: string, email: string): Promise<Booking | null> {
    const e = email.trim().toLowerCase();
    const b = this.bookings.find((x) => x.reference === reference.trim().toUpperCase());
    return b && b.customer?.email === e ? b : null;
  }

  /** For tests / debugging. */
  listBookings(): Booking[] {
    return [...this.bookings];
  }

  private requireEvent(eventId: string): string[] {
    const ids = this.opts.seatIdsFor(eventId);
    if (!ids) throw new BookingError('UNKNOWN_EVENT', `Unknown event ${eventId}.`);
    return ids;
  }

  private soldSet(eventId: string): Set<string> {
    let seeded = this.seeded.get(eventId);
    if (!seeded) {
      seeded = new Set(mockSoldSeats(eventId, this.requireEvent(eventId), this.soldRatio));
      this.seeded.set(eventId, seeded);
    }
    const sold = new Set(seeded);
    for (const b of this.bookings) if (b.eventId === eventId) b.seatIds.forEach((s) => sold.add(s));
    return sold;
  }

  private purgeExpired() {
    const t = this.now();
    for (const [id, h] of this.holds) if (h.expiresAt <= t) this.holds.delete(id);
  }

  private newId(prefix: string): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[Math.floor(this.random() * alphabet.length)];
    return `${prefix}-${s}`;
  }

  private load(): Booking[] {
    try {
      const raw = this.opts.storage?.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Booking[]) : [];
    } catch {
      return [];
    }
  }

  private save() {
    try {
      this.opts.storage?.setItem(STORAGE_KEY, JSON.stringify(this.bookings));
    } catch {
      /* storage unavailable (private mode): bookings stay in memory */
    }
  }
}
