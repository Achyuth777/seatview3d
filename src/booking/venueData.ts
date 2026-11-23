import { HttpBookingService } from './httpService';
import { LocalBookingService } from './localService';
import type { BookingService } from './types';
import { priceFor, seatIdsFor } from './venues';

export { bowlData, categoriesFor, cinemaData, stadiumData, type BowlVenue } from './venues';

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The app's booking service.
 *  - default: the HTTP backend at /api (Vite proxies it to the server on :3001)
 *  - VITE_BOOKING=local: the in-browser mock from Phase 4 (no server needed)
 */
export const BOOKING_MODE: 'http' | 'local' = import.meta.env.VITE_BOOKING === 'local' ? 'local' : 'http';

export const bookingService: BookingService =
  BOOKING_MODE === 'local'
    ? new LocalBookingService({ seatIdsFor, priceFor, storage: safeLocalStorage() })
    : new HttpBookingService('/api');
