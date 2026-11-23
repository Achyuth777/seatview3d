/**
 * Plan geometry of the bowl. The playing-area boundary is a rounded rectangle: an inner L × W
 * rectangle whose corners are rounded with radius r0 (football/basketball: r0 = 0, a plain
 * rectangle; cricket: L ≈ W ≈ 0 and r0 = boundary radius, an oval).
 * Every seating row follows that boundary offset outward by a constant distance o, so its corners
 * have radius r0 + o. Because the offset is constant, the horizontal distance from any point on the
 * row to the nearest boundary line is exactly o — the Green Guide focal point for every seat.
 *
 * Segments, walking clockwise seen from above (+Y), starting on the +Z side:
 *   0 side (+Z)  1 corner (+X,+Z)  2 end (+X)  3 corner (+X,−Z)
 *   4 side (−Z)  5 corner (−X,−Z)  6 end (−X)  7 corner (−X,+Z)
 */
export interface PlanPoint {
  x: number;
  z: number;
  /** Outward unit normal (away from the playing area). */
  nx: number;
  nz: number;
}

export type SegmentKind = 'side' | 'corner' | 'end';

export const SEGMENT_KINDS: SegmentKind[] = ['side', 'corner', 'end', 'corner', 'side', 'corner', 'end', 'corner'];

export function segmentLength(seg: number, L: number, W: number, o: number, r0 = 0): number {
  const kind = SEGMENT_KINDS[seg]!;
  if (kind === 'side') return L;
  if (kind === 'end') return W;
  return (Math.PI / 2) * (r0 + o);
}

/** Point on segment `seg` at parameter t ∈ [0, 1], for offset o from the boundary. */
export function pointOnSegment(seg: number, t: number, L: number, W: number, o: number, r0 = 0): PlanPoint {
  const hl = L / 2;
  const hw = W / 2;
  const r = r0 + o;
  switch (seg) {
    case 0:
      return { x: -hl + t * L, z: hw + r, nx: 0, nz: 1 };
    case 2:
      return { x: hl + r, z: hw - t * W, nx: 1, nz: 0 };
    case 4:
      return { x: hl - t * L, z: -hw - r, nx: 0, nz: -1 };
    case 6:
      return { x: -hl - r, z: -hw + t * W, nx: -1, nz: 0 };
    default: {
      const c = (seg - 1) / 2; // corner index 0..3
      const centre = [
        [hl, hw],
        [hl, -hw],
        [-hl, -hw],
        [-hl, hw],
      ][c]!;
      const theta = Math.PI / 2 - c * (Math.PI / 2) - t * (Math.PI / 2);
      const nx = Math.cos(theta);
      const nz = Math.sin(theta);
      return { x: centre[0]! + r * nx, z: centre[1]! + r * nz, nx, nz };
    }
  }
}

/** Closed polyline of the row line at offset o (corners subdivided), for building meshes. */
export function sampleLoop(L: number, W: number, o: number, r0 = 0, cornerSegments = 16): PlanPoint[] {
  const pts: PlanPoint[] = [];
  for (let seg = 0; seg < 8; seg++) {
    const n = SEGMENT_KINDS[seg] === 'corner' ? cornerSegments : 1;
    for (let i = 0; i < n; i++) pts.push(pointOnSegment(seg, i / n, L, W, o, r0));
  }
  pts.push(pts[0]!);
  return pts;
}

/** Distance from (x, z) to the boundary (positive outside the playing area). */
export function distanceToBoundary(x: number, z: number, L: number, W: number, r0 = 0): number {
  const dx = Math.max(Math.abs(x) - L / 2, 0);
  const dz = Math.max(Math.abs(z) - W / 2, 0);
  return Math.hypot(dx, dz) - r0;
}
