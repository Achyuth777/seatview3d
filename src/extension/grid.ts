/**
 * A cinema's seat map as read from a booking page, independent of how that page is built.
 * x is the slot's horizontal centre in seat widths, measured on the page and centred on the map.
 */
export type Slot = { kind: 'gap'; x: number } | { kind: 'seat'; x: number; number: number | null; available: boolean };
/**
 * label is unique within the map. When a letter repeats in another seating area (District restarts
 * at A per price block), later rows get "#2", "#3"...; rowName() gives the letter to show.
 * area is the seating area's name from the page, when it has one.
 */
export interface GridRow { label: string; slots: Slot[]; area?: string }
export const rowName = (label: string) => label.replace(/#\d+$/, '');
export interface SeatGrid {
  /** Rows in page order (top to bottom). */
  rows: GridRow[];
  /** True when the page draws the screen below the rows (so the bottom row is nearest the screen). */
  screenAtBottom: boolean;
}

/** What the content script sends to the viewer. */
export interface PagePayload {
  grid: SeatGrid;
  film: string | null;
  showLine: string | null;
  cinemaId: string | null;
  posterUrl: string | null;
  imax: boolean;
}

export type ViewerMessage =
  | { source: 'seatview-district'; type: 'page'; payload: PagePayload }
  | { source: 'seatview-district'; type: 'seat'; row: string; number: number; mode: 'hover' | 'select' | 'leave' };

/**
 * Fills in seat numbers the page only shows for available seats. Booking sites number seats
 * either right-to-left or left-to-right, counting across aisles; the direction that agrees with the
 * visible numbers wins. Rows with no visible numbers use right-to-left (District's usual order).
 */
export function numberRow(row: GridRow): GridRow {
  const seatIdx = row.slots.map((s, i) => (s.kind === 'seat' ? i : -1)).filter((i) => i >= 0);
  const n = seatIdx.length;
  const rtl = new Map(seatIdx.map((slot, k) => [slot, n - k]));
  const ltr = new Map(seatIdx.map((slot, k) => [slot, k + 1]));
  const known = seatIdx.flatMap((i) => { const s = row.slots[i]!; return s.kind === 'seat' && s.number !== null ? [[i, s.number] as const] : []; });
  const agrees = (m: Map<number, number>) => known.every(([i, num]) => m.get(i) === num);
  const order = !known.length || agrees(rtl) ? rtl : agrees(ltr) ? ltr : rtl;
  return {
    ...row,
    slots: row.slots.map((s, i) => (s.kind === 'seat' ? { ...s, number: s.number ?? order.get(i)! } : s)),
  };
}
