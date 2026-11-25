import { describe, expect, it } from 'vitest';
import { computeCinemaMetrics } from '../src/engine/cinema/metrics';
import { numberRow, type GridRow, type SeatGrid, type Slot } from '../src/extension/grid';
import { layoutFromGrid } from '../src/extension/gridLayout';

/** Builds a row from a pattern like ". x x a20 a19 x . a8": "." gap, "x" taken seat, "aN" available seat N. */
const row = (label: string, pattern: string): GridRow => ({
  label,
  slots: pattern.split(' ').map((t, i): Slot => (t === '.' ? { kind: 'gap', x: i } : { kind: 'seat', x: i, available: t.startsWith('a'), number: t.startsWith('a') ? Number(t.slice(1)) : null })),
});
const nums = (r: GridRow) => r.slots.flatMap((s) => (s.kind === 'seat' ? [s.number] : []));

describe('seat numbering', () => {
  it('fills in numbers for taken seats, right to left across aisles (as on District)', () => {
    // Row B as read from a real District seat map on 2026-11-25: 7 + 9 + 7 seats.
    const b = numberRow(row('B', 'x x a21 x x x x . . . x a15 x x x x x x x . . . x x x x x x a1'));
    expect(nums(b)).toEqual(Array.from({ length: 23 }, (_, i) => 23 - i));
  });
  it('detects left-to-right numbering from the visible numbers', () => {
    expect(nums(numberRow(row('C', 'a1 x . x a4')))).toEqual([1, 2, 3, 4]);
  });
  it('defaults to right to left when no number is visible', () => {
    expect(nums(numberRow(row('D', 'x x . x')))).toEqual([3, 2, 1]);
  });
});

describe('hall from a seat map', () => {
  const grid: SeatGrid = {
    screenAtBottom: true,
    rows: [
      row('A', 'a3 a2 a1'),
      row('B', 'x a4 . x x a1'),
      row('C', '. x a2 a1 .'),
    ],
  };
  const { layout, assumptions } = layoutFromGrid(grid);

  it('puts the row nearest the screen first and keeps the page’s labels and numbers', () => {
    expect(layout.rows.map((r) => r.label)).toEqual(['C', 'B', 'A']);
    expect(layout.seats.filter((s) => s.rowIndex === 0).map((s) => s.id)).toEqual(['C3', 'C2', 'C1']);
    expect(layout.seats).toHaveLength(3 + 5 + 3);
    expect(layout.rows[2]!.eyeDistance).toBeGreaterThan(layout.rows[0]!.eyeDistance);
    expect(layout.rows[2]!.treadHeight).toBeGreaterThan(layout.rows[0]!.treadHeight);
  });
  it('keeps the aisle as a real gap and centres the seating', () => {
    const b = layout.seats.filter((s) => layout.rows[s.rowIndex]!.label === 'B').map((s) => s.x).sort((p, q) => p - q);
    expect(b[2]! - b[1]!).toBeCloseTo(2 * 0.55, 5);
    expect(Math.min(...layout.seats.map((s) => s.x)) + Math.max(...layout.seats.map((s) => s.x))).toBeCloseTo(0, 5);
  });
  it('estimates a screen size within limits and says what it assumed', () => {
    expect(layout.screen.width).toBeGreaterThanOrEqual(8);
    expect(layout.screen.width).toBeLessThanOrEqual(20);
    expect(assumptions.join(' ')).toMatch(/estimated/);
    expect(layoutFromGrid(grid, { imax: true }).layout.params.screen.aspect).toBe(1.9);
  });
  it('gives every seat a full set of measurements', () => {
    for (const s of layout.seats) {
      const m = computeCinemaMetrics(layout, s);
      expect(m.distanceToScreenCentre).toBeGreaterThan(0);
      expect(['good', 'acceptable', 'poor', 'unacceptable']).toContain(m.grades.overall);
    }
  });
  it('refuses a page with no seats', () => {
    expect(() => layoutFromGrid({ screenAtBottom: true, rows: [row('A', '. .')] })).toThrow();
  });
});
