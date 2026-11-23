/**
 * Deterministic mock "already sold" seats, shared by the in-browser service and the server seed,
 * so both produce the same picture for an event.
 */

/** mulberry32 PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Share of seats pre-sold per event [assumed]. */
export const MOCK_SOLD_RATIO = 0.35;

export function mockSoldSeats(eventId: string, seatIds: string[], ratio = MOCK_SOLD_RATIO): string[] {
  const rng = mulberry32(hashString(eventId));
  return seatIds.filter(() => rng() < ratio);
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Booking reference like SV-7K2QXM (no I/O/0/1 to avoid misreading). */
export function newReference(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)];
  return `SV-${s}`;
}
