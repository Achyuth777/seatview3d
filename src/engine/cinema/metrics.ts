import { clearanceOverFront, distance, toDeg, worstGrade, type Grade } from '../common/geometry';
import type { CinemaLayout, CinemaSeat } from './layout';

/**
 * Cinema viewing metrics for one seat. Computed analytically from the layout, never from the render.
 * Grading bands and sources:
 *  - horizontalScreenAngle: UNIC §4.1 (front rows: < 80° comfortable, <= 90° max);
 *    back rows: THX 36° from the farthest seat, SMPTE EG-18 30° minimum [secondary sources].
 *  - offAxisAngle: UNIC §4.2 (<= 35° good, <= 45° acceptable, > 45° unacceptable).
 *  - verticalToCentre: UNIC §4.3 (<= 25°).
 *  - verticalToTop: UNIC §4.3 (35° recommended in some countries, 45° max).
 *  - sightlineClearance: UNIC §4.7 (>= 200 good, 150-200 acceptable, 120-150 poor, < 120 mm unacceptable).
 */
export interface CinemaSeatMetrics {
  seatId: string;
  /** Eye to screen centre, 3D, metres. */
  distanceToScreenCentre: number;
  /** Horizontal distance from the eye to the screen plane, metres. */
  distanceToScreenPlane: number;
  /** Horizontal angle the picture width subtends at the eye, degrees. */
  horizontalScreenAngle: number;
  /** Horizontal angle between the eye→screen-centre line and the screen normal, degrees. */
  offAxisAngle: number;
  /** Upward angle from the eye to the picture centre, degrees. */
  verticalToCentre: number;
  /** Upward angle from the eye to the picture top, degrees. */
  verticalToTop: number;
  /** Clearance over the sightline-eye of the seat directly in front, metres (null for row A). */
  sightlineClearance: number | null;
  grades: {
    horizontalScreenAngle: Grade;
    offAxisAngle: Grade;
    verticalToCentre: Grade;
    verticalToTop: Grade;
    sightlineClearance: Grade;
    overall: Grade;
  };
}

/** Horizontal angle subtended by a flat screen of width w from an eye at lateral offset x and depth d. */
export function horizontalScreenAngle(w: number, x: number, d: number): number {
  return toDeg(Math.atan((w / 2 - x) / d) + Math.atan((w / 2 + x) / d));
}

export function gradeHorizontal(deg: number): Grade {
  if (deg > 90) return 'unacceptable';
  if (deg >= 80) return 'acceptable';
  if (deg >= 36) return 'good';
  if (deg >= 30) return 'acceptable';
  return 'poor';
}

export function gradeOffAxis(deg: number): Grade {
  if (deg <= 35) return 'good';
  if (deg <= 45) return 'acceptable';
  return 'unacceptable';
}

export function gradeVerticalCentre(deg: number): Grade {
  return deg <= 25 ? 'good' : 'poor';
}

export function gradeVerticalTop(deg: number): Grade {
  if (deg <= 35) return 'good';
  if (deg <= 45) return 'acceptable';
  return 'unacceptable';
}

export function gradeClearance(c: number | null): Grade {
  if (c === null) return 'good'; // nothing in front
  if (c >= 0.2 - 1e-9) return 'good';
  if (c >= 0.15 - 1e-9) return 'acceptable';
  if (c >= 0.12 - 1e-9) return 'poor';
  return 'unacceptable';
}

/** Clearance of the sightline from `back` to the bottom picture line over the eye of `front`. */
export function sightlineClearance(layout: CinemaLayout, back: CinemaSeat, front: CinemaSeat): number {
  const b = layout.screen.bottom;
  return clearanceOverFront(
    back.sightlineEye.y - b,
    back.sightlineEye.z,
    front.sightlineEye.y - b,
    front.sightlineEye.z,
  );
}

export function computeCinemaMetrics(layout: CinemaLayout, seat: CinemaSeat): CinemaSeatMetrics {
  const { eye } = seat;
  const { screen } = layout;
  const d = eye.z;

  const h = horizontalScreenAngle(screen.width, eye.x, d);
  const offAxis = toDeg(Math.atan(Math.abs(eye.x) / d));
  const vCentre = toDeg(Math.atan((screen.centre.y - eye.y) / d));
  const vTop = toDeg(Math.atan((screen.top - eye.y) / d));

  const front = layout.seats.find(
    (s) => s.rowIndex === seat.rowIndex - 1 && s.number === seat.number,
  );
  const c = front ? sightlineClearance(layout, seat, front) : null;

  const grades = {
    horizontalScreenAngle: gradeHorizontal(h),
    offAxisAngle: gradeOffAxis(offAxis),
    verticalToCentre: gradeVerticalCentre(vCentre),
    verticalToTop: gradeVerticalTop(vTop),
    sightlineClearance: gradeClearance(c),
  };

  return {
    seatId: seat.id,
    distanceToScreenCentre: distance(eye, screen.centre),
    distanceToScreenPlane: d,
    horizontalScreenAngle: h,
    offAxisAngle: offAxis,
    verticalToCentre: vCentre,
    verticalToTop: vTop,
    sightlineClearance: c,
    grades: { ...grades, overall: worstGrade(Object.values(grades)) },
  };
}
