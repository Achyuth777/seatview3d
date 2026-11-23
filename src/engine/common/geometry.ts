/** Shared, framework-free geometry helpers. Units: metres and degrees. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Sightline clearance of a back viewer over the eye of the viewer in front, measured where the
 * back viewer's sightline to the focal point passes the front viewer's eye. Both venue types use it:
 *  - cinema: focal = bottom picture line (UNIC §4.7 "c")
 *  - stadium: focal = nearest touchline (Green Guide "C" = D(N+R)/(D+T) − R)
 * Heights are measured above the focal point, distances horizontally to the focal point.
 */
export function clearanceOverFront(backY: number, backD: number, frontY: number, frontD: number): number {
  return (backY * frontD) / backD - frontY;
}

/** Grade scale shared by both venue types (worst last). */
export type Grade = 'good' | 'acceptable' | 'poor' | 'unacceptable';

const ORDER: Grade[] = ['good', 'acceptable', 'poor', 'unacceptable'];

export function worstGrade(grades: Grade[]): Grade {
  return grades.reduce<Grade>((w, g) => (ORDER.indexOf(g) > ORDER.indexOf(w) ? g : w), 'good');
}
