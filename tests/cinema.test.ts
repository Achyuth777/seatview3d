import { describe, expect, it } from 'vitest';
import { buildCinemaLayout, seatXPositions, solveTreads } from '../src/engine/cinema/layout';
import {
  computeCinemaMetrics,
  gradeClearance,
  horizontalScreenAngle,
  sightlineClearance,
} from '../src/engine/cinema/metrics';
import { DEMO_SCOPE_HALL } from '../src/engine/cinema/params';

describe('horizontalScreenAngle', () => {
  it('is 90° when the eye is centred at a distance of W/2', () => {
    expect(horizontalScreenAngle(14, 0, 7)).toBeCloseTo(90, 9);
  });
  it('matches 2·atan(W/2d) on axis: W=14, d=8.4 → 79.61°', () => {
    // hand calc: 2 * atan(7 / 8.4) = 2 * 39.806° = 79.611°
    expect(horizontalScreenAngle(14, 0, 8.4)).toBeCloseTo(79.611, 3);
  });
  it('is smaller off-axis than on-axis at the same depth', () => {
    expect(horizontalScreenAngle(14, 5, 10)).toBeLessThan(horizontalScreenAngle(14, 0, 10));
  });
  it('is symmetric in x', () => {
    expect(horizontalScreenAngle(14, -3, 10)).toBeCloseTo(horizontalScreenAngle(14, 3, 10), 12);
  });
});

describe('seat positions', () => {
  it('centres the blocks on x = 0 and respects pitch and aisles', () => {
    const xs = seatXPositions(DEMO_SCOPE_HALL.seats);
    expect(xs).toHaveLength(24);
    expect(xs[0]! + xs[23]!).toBeCloseTo(0, 12);
    expect(xs[1]! - xs[0]!).toBeCloseTo(0.6, 12); // within a block
    expect(xs[5]! - xs[4]!).toBeCloseTo(0.6 + 1.2, 12); // across an aisle
  });
});

describe('riser solver (UNIC §4.7)', () => {
  const layout = buildCinemaLayout(DEMO_SCOPE_HALL);

  it('gives every row at least the target clearance of 200 mm', () => {
    for (const seat of layout.seats) {
      const m = computeCinemaMetrics(layout, seat);
      if (m.sightlineClearance !== null) {
        expect(m.sightlineClearance).toBeGreaterThanOrEqual(0.2 - 1e-9);
      }
    }
  });

  it('row B tread matches a hand calculation', () => {
    // Y_A = 1.20 - 1.00 = 0.20;  Y_B = 9.6 * (0.20 + 0.20) / 8.4 = 0.457142...
    // tread_B = 0.457142 - 0.20 = 0.257142 → rounded up to 0.26
    expect(solveTreads(DEMO_SCOPE_HALL)[1]).toBeCloseTo(0.26, 9);
  });

  it('treads never descend', () => {
    const t = solveTreads(DEMO_SCOPE_HALL);
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]!);
  });

  it('clearance formula: equal eye heights at equal ratio give zero clearance gain', () => {
    const front = layout.seats.find((s) => s.id === 'A1')!;
    // A synthetic seat directly behind on the same line to the bottom picture line → c = 0
    const yFront = front.sightlineEye.y - layout.screen.bottom;
    const zBack = front.sightlineEye.z * 2;
    const back = {
      ...front,
      sightlineEye: { x: front.x, y: layout.screen.bottom + yFront * 2, z: zBack },
    };
    expect(sightlineClearance(layout, back, front)).toBeCloseTo(0, 12);
  });
});

describe('demo hall metrics', () => {
  const layout = buildCinemaLayout(DEMO_SCOPE_HALL);
  const m = (id: string) => computeCinemaMetrics(layout, layout.seats.find((s) => s.id === id)!);

  it('front-row centre seat sits at the UNIC 0.6·W comfort limit', () => {
    const a = m('A12');
    expect(a.distanceToScreenPlane).toBeCloseTo(8.4, 9);
    expect(a.horizontalScreenAngle).toBeLessThan(80);
  });

  it('back row still meets the SMPTE 30° minimum on axis', () => {
    const last = layout.rows[layout.rows.length - 1]!;
    expect(m(`${last.label}12`).horizontalScreenAngle).toBeGreaterThan(30);
  });

  it('clearance grade bands', () => {
    expect(gradeClearance(0.2)).toBe('good');
    expect(gradeClearance(0.15)).toBe('acceptable');
    expect(gradeClearance(0.12)).toBe('poor');
    expect(gradeClearance(0.1)).toBe('unacceptable');
  });
});
