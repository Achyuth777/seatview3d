import { useSyncExternalStore } from 'react';

/**
 * Local profile (no passwords): name, email and the references of bookings made in this browser.
 * Bookings themselves live on the server and are fetched by reference + email.
 */
export interface LocalProfile {
  name: string;
  email: string;
  city: string; // '' = all cities
  bookings: { reference: string; email: string; eventId: string; savedAt: number }[];
}

const KEY = 'seatview.profile.v1';
const EMPTY: LocalProfile = { name: '', email: '', city: '', bookings: [] };
const listeners = new Set<() => void>();
let cache: LocalProfile | null = null;

function read(): LocalProfile {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<LocalProfile>) : {};
    cache = { ...EMPTY, ...parsed, bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [] };
  } catch {
    cache = { ...EMPTY };
  }
  return cache;
}

function write(next: LocalProfile): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the profile lives for this session only */
  }
  listeners.forEach((l) => l());
}

export function updateProfile(patch: Partial<Omit<LocalProfile, 'bookings'>>): void {
  write({ ...read(), ...patch });
}

export function rememberBooking(b: { reference: string; email: string; eventId: string }): void {
  const p = read();
  if (p.bookings.some((x) => x.reference === b.reference)) return;
  write({ ...p, bookings: [{ ...b, savedAt: Date.now() }, ...p.bookings] });
}

export function forgetBooking(reference: string): void {
  const p = read();
  write({ ...p, bookings: p.bookings.filter((b) => b.reference !== reference) });
}

export function useProfile(): LocalProfile {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => EMPTY,
  );
}
