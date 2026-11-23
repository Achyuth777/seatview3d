/** Booking domain types. Framework-free; shared by the local service and (later) the backend. */

export type VenueKind = 'cinema' | 'stadium' | 'arena' | 'cricket';

export interface PriceCategory {
  id: string;
  label: string;
  /** Price per seat in minor units (e.g. cents) to avoid floating-point money. */
  priceMinor: number;
}

export interface EventInfo {
  id: string;
  venue: VenueKind;
  title: string;
  startsAt: string; // ISO 8601, local time
  currency: string; // ISO 4217
  categories: PriceCategory[];
  /** The film or fixture this session belongs to (see catalog LISTINGS). */
  listingId?: string;
  city?: string;
  venueName?: string;
}

export interface Hold {
  id: string;
  eventId: string;
  seatIds: string[];
  /** Epoch ms. The timer starts when the hold is created and is not extended by adding seats. */
  expiresAt: number;
}

export interface Booking {
  reference: string;
  /** Contact details given at checkout (absent on seeded mock sales). */
  customer?: { name: string; email: string };
  eventId: string;
  seatIds: string[];
  totalMinor: number;
  currency: string;
  createdAt: number;
}

export interface Availability {
  sold: Set<string>;
  /** Seats held by other customers' active holds (not the caller's own hold). */
  heldByOthers: Set<string>;
}

export type SeatState = 'available' | 'sold' | 'held' | 'cart';

export class BookingError extends Error {
  constructor(
    public code: 'SEAT_UNAVAILABLE' | 'UNKNOWN_SEAT' | 'TOO_MANY_SEATS' | 'HOLD_EXPIRED' | 'UNKNOWN_EVENT' | 'EMPTY_HOLD' | 'INVALID_CUSTOMER',
    message: string,
    public seatIds: string[] = [],
  ) {
    super(message);
  }
}

/**
 * The contract the UI depends on. Phase 4 ships `LocalBookingService` (in the browser);
 * the backend phase replaces it with an HTTP client implementing the same interface.
 */
export interface BookingService {
  getAvailability(eventId: string, ownHoldId?: string): Promise<Availability>;
  /** Creates a hold, or replaces the seats of an existing live hold (keeping its expiry). */
  hold(eventId: string, seatIds: string[], existingHoldId?: string): Promise<Hold>;
  release(holdId: string): Promise<void>;
  /** Confirms a hold. Retrying with the same hold id returns the original booking. */
  confirm(holdId: string, customer: { name: string; email: string }): Promise<Booking>;
  /** A booking by reference, returned only when the email matches the one given at checkout. */
  findBooking(reference: string, email: string): Promise<Booking | null>;
}
