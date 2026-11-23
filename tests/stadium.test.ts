import { describe, expect, it } from 'vitest';
import { clearanceOverFront } from '../src/engine/common/geometry';
import { pointOnSegment, sampleLoop, segmentLength } from '../src/engine/stadium/bowl';
import { buildStadiumLayout, solveRows } from '../src/engine/stadium/layout';
import {
  computeStadiumMetrics,
  gradeC,
  gradeFarCorner,
  horizontalSpan,
  rowCValue,
} from '../src/engine/stadium/metrics';
import { DEMO_FOOTBALL_STADIUM as P } from '../src/engine/stadium/params';

/** Green Guide Diagram 12.1, written literally. */
const greenGuideC = (D: number, N: number, R: number, T: number) => (D * (N + R)) / (D + T) - R;

describe('Green Guide C formula', () => {
  it('shared clearance function equals C = D(N+R)/(D+T) − R', () => {
    // front eye: D = 20 m, R = 8 m; back row: T = 0.8 m behind, N = 0.45 m higher
    const D = 20, R = 8, T = 0.8, N = 0.45;
    expect(clearanceOverFront(R + N, D + T, R, D)).toBeCloseTo(greenGuideC(D, N, R, T), 12);
  });
  it('hand calculation: D=20, N=0.45, R=8, T=0.8 → C = 0.1250 m', () => {
    // 20 * 8.45 / 20.8 − 8 = 8.125 − 8 = 0.125
    expect(greenGuideC(20, 0.45, 8, 0.8)).toBeCloseTo(0.125, 10);
  });
});

describe('bowl plan geometry', () => {
  const { length: L, width: W } = P.pitch;
  it('every point of an offset row is exactly o from the nearest pitch line', () => {
    const o = 12.3;
    for (const p of sampleLoop(L, W, o, 0, 8)) {
      const dx = Math.max(Math.abs(p.x) - L / 2, 0);
      const dz = Math.max(Math.abs(p.z) - W / 2, 0);
      expect(Math.hypot(dx, dz)).toBeCloseTo(o, 9);
    }
  });
  it('segments join continuously', () => {
    for (let s = 0; s < 8; s++) {
      const a = pointOnSegment(s, 1, L, W, 10);
      const b = pointOnSegment((s + 1) % 8, 0, L, W, 10);
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(a.z).toBeCloseTo(b.z, 9);
    }
  });
  it('corner arc length is πo/2', () => {
    expect(segmentLength(1, L, W, 10)).toBeCloseTo((Math.PI * 10) / 2, 12);
  });
});

describe('riser solver', () => {
  const { rows } = solveRows(P);
  const layout = buildStadiumLayout(P);

  it('never exceeds the 34° rake cap (Green Guide §13.11)', () => {
    for (const r of rows) if (r.rakeDeg !== null) expect(r.rakeDeg).toBeLessThanOrEqual(34 + 1e-9);
  });

  it('meets the tier target C wherever the rake cap is not binding (rows within a tier)', () => {
    const cap = Math.floor((0.8 * Math.tan((34 * Math.PI) / 180)) / 0.01) * 0.01;
    // A tier's first row is not solved for C (it is set by lift/headroom); it is measured over
    // the boards or its balustrade instead — see the Phase 8 tests.
    for (const r of rows.filter((x) => x.rowInTier > 1)) {
      const c = rowCValue(layout, r.index)!;
      const capped = r.rakeDeg !== null && Math.abs(r.riser - cap) < 1e-9;
      if (!capped) expect(c).toBeGreaterThanOrEqual(P.tiers[r.tier]!.targetC - 1e-9);
    }
  });

  it('row 2 riser matches a hand calculation', () => {
    // Row 1: front edge 8.0, eye at 8.0 + 0.8 − 0.15 = 8.65 m, tread 1.0 → R = 2.2 m
    // Row 2 eye at 9.45 m. N = (0.09 + 2.2) * 9.45 / 8.65 − 2.2 = 0.30179 → min rake 15°: 0.8·tan15 = 0.2144
    // → 0.30179 rounded up to 0.31
    expect(rows[1]!.riser).toBeCloseTo(0.31, 9);
  });

  it('upper tier starts at least `lift` above the lower tier', () => {
    const lowerLast = rows.find((r) => r.tier === 0 && r.rowInTier === P.tiers[0]!.rows)!;
    const upperFirst = rows.find((r) => r.tier === 1 && r.rowInTier === 1)!;
    expect(upperFirst.treadHeight - lowerLast.treadHeight).toBeGreaterThanOrEqual(P.tiers[1]!.lift - 1e-9);
    expect(upperFirst.frontOffset).toBeCloseTo(lowerLast.frontOffset + 0.8 + P.tiers[1]!.setback, 9);
  });
});

describe('seats and metrics', () => {
  const layout = buildStadiumLayout(P);

  it('seat ids are unique', () => {
    expect(layout.seatById.size).toBe(layout.seats.length);
  });

  it('halfway-line front-row seat: focal distance and pitch angle', () => {
    const seat = layout.seats
      .filter((s) => s.rowIndex === 0 && s.segment === 0)
      .reduce((a, b) => (Math.abs(a.eye.x) < Math.abs(b.eye.x) ? a : b));
    const m = computeStadiumMetrics(layout, seat);
    expect(m.distanceToFocal).toBeCloseTo(8.65, 9);
    // From (≈0, 34 + 8.65): pitch spans 2·atan(52.5 / 8.65) ≈ 161.3°
    expect(m.pitchHorizontalAngle).toBeCloseTo(2 * (Math.atan(52.5 / 8.65) * 180) / Math.PI, 0);
  });

  it('horizontalSpan of a square seen face-on', () => {
    // eye 1 m in front of a 2 m wide edge → corners at ±1 m: 90°, far corners narrower
    expect(horizontalSpan(0, -1, [{ x: -1, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 2 }, { x: -1, z: 2 }])).toBeCloseTo(90, 9);
  });

  it('grade bands', () => {
    expect(gradeC(0.09)).toBe('good');
    expect(gradeC(0.06)).toBe('acceptable');
    expect(gradeC(0.05)).toBe('unacceptable');
    expect(gradeFarCorner(150)).toBe('good');
    expect(gradeFarCorner(190)).toBe('acceptable');
    expect(gradeFarCorner(191)).toBe('unacceptable');
  });
});

describe('Phase 8: boards, roof, overhang, presets', async () => {
  const { DEMO_BASKETBALL_ARENA, DEMO_CRICKET_GROUND } = await import('../src/engine/stadium/params');
  const { distanceToBoundary } = await import('../src/engine/stadium/bowl');
  const { clearanceOverObstacle, rowClearance } = await import('../src/engine/stadium/metrics');
  const layout = buildStadiumLayout(P);

  it('front row: C measured over the advertising boards (hand calculation)', () => {
    // Row 1 eye: offset 8.65 m, height 1.0 + 1.2 = 2.2 m. Boards: 5 m from the touchline, 0.9 m tall.
    // Sightline height above the boards = 2.2 · 5 / 8.65 = 1.27168 → clearance 0.37168 m.
    const r = rowClearance(layout, layout.rows[0]!);
    expect(r.over).toBe('advertising boards');
    expect(r.value).toBeCloseTo(2.2 * (5 / 8.65) - 0.9, 9);
    expect(clearanceOverObstacle(2.2, 8.65, 5, 0.9)).toBeCloseTo(0.37168, 4);
  });

  it('overhanging upper tier: 1.5 m overhang, headroom ≥ 2.5 m over every covered lower row', () => {
    expect(layout.soffits).toHaveLength(1);
    const s = layout.soffits[0]!;
    const lowerLast = layout.rows.find((r) => r.tier === 0 && r.rowInTier === 25)!;
    expect(s.backOffset - s.frontOffset).toBeCloseTo(1.5, 9);
    const covered = layout.rows.filter((r) => r.tier === 0 && r.frontOffset + 0.8 > s.frontOffset);
    expect(covered.length).toBe(2); // rows 24 (partly) and 25
    for (const r of covered) expect(s.height - r.treadHeight).toBeGreaterThanOrEqual(2.5 - 1e-9);
    // Headroom is binding (raised above the 3 m minimum lift): soffit = last lower tread + 2.5.
    expect(s.height).toBeCloseTo(lowerLast.treadHeight + 2.5, 2);
  });

  it('upper tier first row is measured over its own front balustrade', () => {
    const first = layout.rows.find((r) => r.tier === 1 && r.rowInTier === 1)!;
    const r = rowClearance(layout, first);
    expect(r.over).toBe('tier front balustrade');
    const eyeY = first.treadHeight + 1.2;
    expect(r.value).toBeCloseTo((eyeY * first.tierFrontOffset) / first.eyeOffset - (first.treadHeight + 0.5), 9);
    expect(r.value!).toBeGreaterThanOrEqual(0.09); // with the 0.5 m opaque front
  });

  it('roof: covered seats get a "view up to" height; hand calculation on the halfway line', () => {
    // Back row of the upper tier, halfway line (+Z side): ray to the centre is along −normal (cos = 1).
    const back = layout.rows[layout.rows.length - 1]!;
    const seat = layout.seats
      .filter((s) => s.rowIndex === back.index && s.segment === 0)
      .reduce((a, b) => (Math.abs(a.eye.x) < Math.abs(b.eye.x) ? a : b));
    const m = computeStadiumMetrics(layout, seat);
    const eyeY = back.treadHeight + 1.2;
    const dEdge = back.eyeOffset - 16; // roof front edge at 16 m
    const dCentre = Math.hypot(seat.eye.x, seat.eye.z);
    expect(m.covered).toBe(true);
    expect(m.viewUpTo!.limitedBy).toBe('roof');
    expect(m.viewUpTo!.height).toBeCloseTo(eyeY + ((27 - eyeY) * dCentre) / dEdge, 1);
    // Front row is open to the sky.
    const front = layout.seats.find((s) => s.rowIndex === 0)!;
    expect(computeStadiumMetrics(layout, front).viewUpTo).toBeNull();
  });

  it('lower rows under the overhang are capped by the upper tier, with headroom reported', () => {
    const lowerLast = layout.rows.find((r) => r.tier === 0 && r.rowInTier === 25)!;
    const seat = layout.seats.find((s) => s.rowIndex === lowerLast.index && s.segment === 0)!;
    const m = computeStadiumMetrics(layout, seat);
    expect(m.viewUpTo!.limitedBy).toBe('upper tier');
    expect(m.headroom).toBeCloseTo(layout.soffits[0]!.height - lowerLast.treadHeight, 9);
  });

  it('roof clears all covered seats (no warnings) and rake never exceeds 34°', () => {
    expect(layout.warnings).toEqual([]);
    for (const r of layout.rows) if (r.rakeDeg !== null) expect(r.rakeDeg).toBeLessThanOrEqual(34 + 1e-9);
  });

  it('basketball arena: NBA court, all seats unique, no boards, no FIFA grade', () => {
    const a = buildStadiumLayout(DEMO_BASKETBALL_ARENA);
    expect([a.params.pitch.length, a.params.pitch.width]).toEqual([28.65, 15.24]);
    expect(a.seatById.size).toBe(a.seats.length);
    const m = computeStadiumMetrics(a, a.seats[0]!);
    expect(m.cOver).toBeNull(); // courtside front row: nothing in front
    expect(m.grades.farCornerDistance).toBeUndefined();
    expect(a.warnings).toEqual([]);
  });

  it('cricket ground: oval boundary within ICC limits; rows stay a constant offset from the rope', async () => {
    const c = buildStadiumLayout(DEMO_CRICKET_GROUND);
    const radii = c.boundary.map((b) => Math.hypot(b.x, b.z));
    expect(Math.max(...radii)).toBeCloseTo(73, 6); // ends: 10/2 + 68
    const { pointOnSegment: pos } = await import('../src/engine/stadium/bowl');
    const side = pos(0, 0.5, 10, 0, 0, 68);
    expect(Math.hypot(side.x, side.z)).toBeCloseTo(68, 9); // sides (mid-point)
    expect(Math.max(...radii)).toBeLessThanOrEqual(82.3); // ≤ 90 yd
    expect(68).toBeGreaterThanOrEqual(59.4); // ≥ 65 yd (side mid-point is the nearest boundary point)
    for (const s of c.seats.filter((_, i) => i % 997 === 0)) {
      const row = c.rows[s.rowIndex]!;
      expect(distanceToBoundary(s.plan.x, s.plan.z, 10, 0, 68)).toBeCloseTo(row.eyeOffset, 6);
    }
    expect(c.seatById.size).toBe(c.seats.length);
    expect(c.warnings).toEqual([]);
  });
});

describe('Phase 8: design findings stay reproducible', () => {
  const variant = (patch: Partial<(typeof P)['tiers'][number]>) =>
    buildStadiumLayout({ ...P, tiers: [P.tiers[0]!, { ...P.tiers[1]!, ...patch }] });
  const upperFirstC = (l: ReturnType<typeof buildStadiumLayout>) =>
    rowCValue(l, l.rows.find((r) => r.tier === 1 && r.rowInTier === 1)!.index)!;

  it('a solid 0.8 m balcony front nearly hides the near touchline from the first row', () => {
    expect(upperFirstC(variant({ setback: -4, parapetHeight: 0.8 }))).toBeLessThan(0.06);
  });
  it('moving the first row back behind a front gangway makes that worse, not better', () => {
    const base = upperFirstC(variant({ parapetHeight: 0.8 }));
    expect(upperFirstC(variant({ parapetHeight: 0.8, frontGangway: 1.2 }))).toBeLessThan(base);
  });
  it('a 4 m overhang forces back rows below 60 mm under the 34° rake cap', () => {
    const l = variant({ setback: -4 });
    const upper = l.rows.filter((r) => r.tier === 1 && r.rowInTier > 1);
    expect(Math.min(...upper.map((r) => rowCValue(l, r.index)!))).toBeLessThan(0.06);
  });
  it('the shipped demo has no unacceptable seats in any bowl venue', async () => {
    const { DEMO_BASKETBALL_ARENA, DEMO_CRICKET_GROUND } = await import('../src/engine/stadium/params');
    for (const params of [P, DEMO_BASKETBALL_ARENA, DEMO_CRICKET_GROUND]) {
      const l = buildStadiumLayout(params);
      const bad = l.seats.filter((s) => computeStadiumMetrics(l, s).grades.overall === 'unacceptable');
      expect(bad.length, params.name).toBe(0);
    }
  });
});
