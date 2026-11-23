import { clearanceOverFront, toDeg, worstGrade, type Grade } from '../common/geometry';
import type { StadiumLayout, StadiumRow, StadiumSeat } from './layout';

/**
 * Stadium viewing metrics for one seat. Computed analytically from the layout, never from the render.
 * Grading bands and sources:
 *  - cValue: >= 90 mm good, 60–90 mm acceptable, < 60 mm unacceptable
 *    (FIFA 6 cm absolute min / 9 cm recommended min / 12 cm optimum; UEFA 60 / 90–120 mm) [secondary].
 *    Measured over whatever is directly in front: the row in front, the advertising boards (front
 *    row), or the tier's own front balustrade (first row of an upper tier).
 *  - farCornerDistance (football only): FIFA Stadium Guidelines "Stadium Bowl": optimum within 150 m,
 *    maximum 190 m from the far corner of the pitch. Other sports: shown, not graded.
 *  - rake: Green Guide 5th ed. §13.11, 34° maximum for seating.
 *  - viewUpTo (roof / overhang): informational; no sourced threshold.
 */
export type ClearanceOver = 'row in front' | 'advertising boards' | 'tier front balustrade';

export interface StadiumSeatMetrics {
  seatId: string;
  /** Sightline clearance (C) over what is directly in front, metres; null if nothing is in front. */
  cValue: number | null;
  cOver: ClearanceOver | null;
  /** Horizontal distance from the eye to the nearest boundary line (the focal point), metres. */
  distanceToFocal: number;
  /** Eye to centre of the playing area, 3D, metres. */
  distanceToCentre: number;
  /** Eye to the farthest point of the boundary (the far corner on a rectangular pitch), 3D, metres. */
  farCornerDistance: number;
  /** Downward angle from the eye to the centre, degrees. */
  depressionToCentre: number;
  /** Downward angle from the eye to the nearest boundary line, degrees. */
  depressionToFocal: number;
  /** Horizontal angle the whole playing area occupies from the eye, degrees. */
  pitchHorizontalAngle: number;
  /** Rake of the seat's row (null for a tier's first row). */
  rakeDeg: number | null;
  eyeHeightAbovePitch: number;
  /** Seat is under the roof or under an overhanging tier. */
  covered: boolean;
  /** Highest visible point above the centre spot when the view is capped by an overhead edge. */
  viewUpTo: { height: number; limitedBy: 'roof' | 'upper tier' } | null;
  /** Clear height between this row's tread and an overhanging tier's underside (rows under an overhang). */
  headroom: number | null;
  grades: {
    cValue: Grade;
    farCornerDistance?: Grade;
    rake: Grade;
    overall: Grade;
  };
}

export function gradeC(c: number | null): Grade {
  if (c === null) return 'good'; // nothing in front
  if (c >= 0.09 - 1e-9) return 'good';
  if (c >= 0.06 - 1e-9) return 'acceptable';
  return 'unacceptable';
}

export function gradeFarCorner(d: number): Grade {
  if (d <= 150) return 'good';
  if (d <= 190) return 'acceptable';
  return 'unacceptable';
}

export function gradeRake(deg: number | null): Grade {
  return deg === null || deg <= 34 + 1e-9 ? 'good' : 'unacceptable';
}

/**
 * Horizontal angle subtended at (x, z) by a convex set of points, eye outside the set.
 * Angles are measured relative to the direction to the set's centre (origin), so no wrap-around.
 */
export function horizontalSpan(x: number, z: number, pts: { x: number; z: number }[]): number {
  const base = Math.atan2(-z, -x);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    let a = Math.atan2(p.z - z, p.x - x) - base;
    a = Math.atan2(Math.sin(a), Math.cos(a)); // normalise to (−π, π]
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
  }
  return toDeg(hi - lo);
}

/** Clearance of a back eye's sightline to the focal line (at playing-surface level) over an obstacle top. */
export function clearanceOverObstacle(eyeY: number, eyeOffset: number, obstacleOffset: number, obstacleTop: number): number {
  return (eyeY * obstacleOffset) / eyeOffset - obstacleTop;
}

/** C value (or equivalent clearance) of a row over whatever is directly in front of it. */
export function rowClearance(layout: StadiumLayout, row: StadiumRow): { value: number | null; over: ClearanceOver | null } {
  const p = layout.params;
  const h = p.eye.sightlineHeight;
  const eyeY = row.treadHeight + h;
  if (row.index === 0) {
    if (!p.boards) return { value: null, over: null };
    return {
      value: clearanceOverObstacle(eyeY, row.eyeOffset, p.boards.offset, p.boards.height),
      over: 'advertising boards',
    };
  }
  const prev = layout.rows[row.index - 1]!;
  const overRow = (): number => clearanceOverFront(eyeY, row.eyeOffset, prev.treadHeight + h, prev.eyeOffset);
  if (row.rowInTier > 1) return { value: overRow(), over: 'row in front' };

  // First row of an upper tier: over its own balustrade, and over the tier below if that is in front.
  const tier = p.tiers[row.tier]!;
  const parapet = clearanceOverObstacle(eyeY, row.eyeOffset, row.tierFrontOffset, row.treadHeight + (tier.parapetHeight ?? 0));
  if (prev.eyeOffset < row.eyeOffset) {
    const c = overRow();
    if (c < parapet) return { value: c, over: 'row in front' };
  }
  return { value: parapet, over: 'tier front balustrade' };
}

/** @deprecated kept for callers of Phase 3; use rowClearance. */
export function rowCValue(layout: StadiumLayout, rowIndex: number): number | null {
  return rowClearance(layout, layout.rows[rowIndex]!).value;
}

export function computeStadiumMetrics(layout: StadiumLayout, seat: StadiumSeat): StadiumSeatMetrics {
  const p = layout.params;
  const row = layout.rows[seat.rowIndex]!;
  const { eye } = seat;
  const sightY = row.treadHeight + p.eye.sightlineHeight;
  const horizToCentre = Math.hypot(eye.x, eye.z);
  const { value: c, over } = rowClearance(layout, row);
  const farCorner = Math.max(...layout.boundary.map((k) => Math.hypot(k.x - eye.x, k.z - eye.z, eye.y)));

  // Overhead edges that cap the upward view towards the centre.
  const toCentre = { x: -eye.x / horizToCentre, z: -eye.z / horizToCentre };
  const inward = Math.max(-(seat.plan.nx * toCentre.x + seat.plan.nz * toCentre.z), 1e-3); // cos(ray, −normal)
  const edges: { offset: number; height: number; by: 'roof' | 'upper tier' }[] = [];
  if (layout.roof && row.eyeOffset > layout.roof.frontOffset) {
    edges.push({ offset: layout.roof.frontOffset, height: layout.roof.frontHeight, by: 'roof' });
  }
  let headroom: number | null = null;
  for (const s of layout.soffits) {
    if (row.tier === s.tier - 1 && row.frontOffset + p.seating.rowDepth > s.frontOffset) {
      if (row.eyeOffset > s.frontOffset) edges.push({ offset: s.frontOffset, height: s.height, by: 'upper tier' });
      headroom = s.height - row.treadHeight;
    }
  }
  let viewUpTo: StadiumSeatMetrics['viewUpTo'] = null;
  for (const e of edges) {
    const dEdge = (row.eyeOffset - e.offset) / inward;
    const height = sightY + ((e.height - sightY) * horizToCentre) / dEdge;
    if (!viewUpTo || height < viewUpTo.height) viewUpTo = { height, limitedBy: e.by };
  }

  const grades: StadiumSeatMetrics['grades'] = {
    cValue: gradeC(c),
    rake: gradeRake(row.rakeDeg),
    overall: 'good',
  };
  if (p.sport === 'football') grades.farCornerDistance = gradeFarCorner(farCorner);
  grades.overall = worstGrade([grades.cValue, grades.rake, ...(grades.farCornerDistance ? [grades.farCornerDistance] : [])]);

  return {
    seatId: seat.id,
    cValue: c,
    cOver: over,
    distanceToFocal: row.eyeOffset,
    distanceToCentre: Math.hypot(horizToCentre, eye.y),
    farCornerDistance: farCorner,
    depressionToCentre: toDeg(Math.atan(eye.y / horizToCentre)),
    depressionToFocal: toDeg(Math.atan(eye.y / row.eyeOffset)),
    pitchHorizontalAngle: horizontalSpan(eye.x, eye.z, layout.boundary),
    rakeDeg: row.rakeDeg,
    eyeHeightAbovePitch: eye.y,
    covered: edges.length > 0,
    viewUpTo,
    headroom,
    grades,
  };
}
