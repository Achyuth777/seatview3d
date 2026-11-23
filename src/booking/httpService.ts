import { BookingError, type Availability, type Booking, type BookingService, type Hold } from './types';

/** BookingService over the REST API in `server/` (same contract as LocalBookingService). */
export class HttpBookingService implements BookingService {
  constructor(private base: string) {}

  async getAvailability(eventId: string, ownHoldId?: string): Promise<Availability> {
    const q = ownHoldId ? `?holdId=${encodeURIComponent(ownHoldId)}` : '';
    const r = await this.request<{ sold: string[]; heldByOthers: string[] }>(
      'GET',
      `/events/${encodeURIComponent(eventId)}/availability${q}`,
    );
    return { sold: new Set(r.sold), heldByOthers: new Set(r.heldByOthers) };
  }

  hold(eventId: string, seatIds: string[], existingHoldId?: string): Promise<Hold> {
    return this.request('POST', '/holds', { eventId, seatIds, holdId: existingHoldId });
  }

  async release(holdId: string): Promise<void> {
    await this.request('DELETE', `/holds/${encodeURIComponent(holdId)}`);
  }

  confirm(holdId: string, customer: { name: string; email: string }): Promise<Booking> {
    return this.request('POST', `/holds/${encodeURIComponent(holdId)}/confirm`, { customer });
  }

  async findBooking(reference: string, email: string): Promise<Booking | null> {
    const res = await fetch(
      `${this.base}/bookings/${encodeURIComponent(reference.trim().toUpperCase())}?email=${encodeURIComponent(email.trim())}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Booking;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = typeof data.code === 'string' ? data.code : 'SERVER_ERROR';
      const known = ['SEAT_UNAVAILABLE', 'UNKNOWN_SEAT', 'TOO_MANY_SEATS', 'HOLD_EXPIRED', 'UNKNOWN_EVENT', 'EMPTY_HOLD', 'INVALID_CUSTOMER'];
      if (known.includes(code)) {
        throw new BookingError(code as BookingError['code'], data.message ?? code, data.seatIds ?? []);
      }
      throw new Error(data.message ?? `HTTP ${res.status}`);
    }
    return data as T;
  }
}
