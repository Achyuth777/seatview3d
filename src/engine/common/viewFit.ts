import { toDeg } from './geometry';

/** Owner's decision: 60° vertical on normal screens (about 91.5° across at 16:9). */
export const BASE_VERTICAL_FOV = 60;
/** Never open wider across than a 16:9 screen shows at the base FOV. */
export const MAX_HORIZONTAL_FOV = 2 * toDeg(Math.atan(Math.tan((BASE_VERTICAL_FOV * Math.PI) / 360) * (16 / 9)));
/** Beyond this, perspective stretch at the top and bottom of a tall phone becomes unusable. */
export const MAX_VERTICAL_FOV = 135;
/** Breathing room on each side of the subject, degrees. */
const MARGIN_DEG = 1;

const rad = (d: number) => (d * Math.PI) / 180;

/** Horizontal field of view for a vertical one at a given width/height aspect. */
export function horizontalFov(verticalDeg: number, aspect: number): number {
  return 2 * toDeg(Math.atan(Math.tan(rad(verticalDeg) / 2) * aspect));
}

/** Largest horizontal angle between the view direction (eye → target) and any subject point. */
export function subjectHalfAngle(
  eye: { x: number; z: number },
  target: { x: number; z: number },
  points: { x: number; z: number }[],
): number {
  const base = Math.atan2(target.z - eye.z, target.x - eye.x);
  let max = 0;
  for (const p of points) {
    const a = Math.atan2(p.z - eye.z, p.x - eye.x) - base;
    max = Math.max(max, Math.abs(Math.atan2(Math.sin(a), Math.cos(a))));
  }
  return toDeg(max);
}

/**
 * Vertical FOV that fits the subject across an upright (portrait) screen. Landscape screens always
 * keep the base 60°, so desktop views do not change. Very wide subjects (a whole pitch from the front row)
 * are limited to what a 16:9 screen would show.
 */
export function fitVerticalFov(aspect: number, halfAngleDeg: number): number {
  if (aspect >= 1) return BASE_VERTICAL_FOV;
  const wanted = Math.min(2 * (halfAngleDeg + MARGIN_DEG), MAX_HORIZONTAL_FOV);
  if (horizontalFov(BASE_VERTICAL_FOV, aspect) >= wanted) return BASE_VERTICAL_FOV;
  const v = 2 * toDeg(Math.atan(Math.tan(rad(wanted) / 2) / aspect));
  return Math.min(v, MAX_VERTICAL_FOV);
}
