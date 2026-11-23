import type { Vec3 } from '../common/geometry';
import type { CinemaParams } from './params';

export interface CinemaRow {
  index: number; // 0-based
  label: string; // 'A' = front row
  /** Horizontal distance from the screen plane to this row's eye point (X_n). */
  eyeDistance: number;
  /** Tread (floor) height of this row above the front floor. */
  treadHeight: number;
  /** Riser height from the previous row's tread (0 for row A). */
  riser: number;
  /** Floor slab extent in Z for this row: [front, back]. */
  zFront: number;
  zBack: number;
}

export interface CinemaSeat {
  id: string; // e.g. 'H12'
  rowIndex: number;
  number: number; // 1 = leftmost seat as seen by the audience
  x: number;
  /** Camera eye point (tread + cameraHeight). */
  eye: Vec3;
  /** Sightline-reference eye point (tread + sightlineHeight). */
  sightlineEye: Vec3;
}

export interface CinemaLayout {
  params: CinemaParams;
  screen: {
    width: number;
    height: number;
    bottom: number;
    top: number;
    centre: Vec3;
  };
  rows: CinemaRow[];
  seats: CinemaSeat[];
  room: { width: number; depth: number; height: number };
}

const ROW_LABELS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'; // 'I' skipped, as is common in cinemas

/** X positions of every seat centre in a row, left (-x) to right (+x), centred on x = 0. */
export function seatXPositions(p: CinemaParams['seats']): number[] {
  const total =
    p.blocks.reduce((s, n) => s + n * p.seatPitch, 0) + (p.blocks.length - 1) * p.aisleWidth;
  const xs: number[] = [];
  let cursor = -total / 2;
  p.blocks.forEach((n, b) => {
    if (b > 0) cursor += p.aisleWidth;
    for (let i = 0; i < n; i++) {
      xs.push(cursor + p.seatPitch * (i + 0.5));
    }
    cursor += n * p.seatPitch;
  });
  return xs;
}

/**
 * Solves tread heights so every row gets at least `targetClearance` over the eye of the row in front,
 * measured on the sightline to the bottom picture line (UNIC handbook §4.7).
 *
 * With Y_n = sightline-eye height above the bottom picture line and X_n = eye distance to the screen,
 * similar triangles give the clearance of row n over row n-1:
 *     c_n = Y_n * X_{n-1} / X_n - Y_{n-1}
 * so the minimum Y_n for a target c is  Y_n = X_n * (Y_{n-1} + c) / X_{n-1}.
 * Treads are rounded up to `rounding` and never descend.
 */
export function solveTreads(p: CinemaParams): number[] {
  const { firstRowEyeDistance: x1, rowPitch, count } = p.rows;
  const { sightlineHeight } = p.eye;
  const { bottomEdge } = p.screen;
  const { targetClearance: c, rounding } = p.risers;

  const treads = [0];
  let prevY = sightlineHeight - bottomEdge; // row A tread is the front floor (0)
  for (let n = 1; n < count; n++) {
    const xPrev = x1 + (n - 1) * rowPitch;
    const x = x1 + n * rowPitch;
    const yReq = (x * (prevY + c)) / xPrev;
    const treadReq = yReq - sightlineHeight + bottomEdge;
    const rounded = Math.ceil(treadReq / rounding - 1e-9) * rounding;
    const tread = Math.max(rounded, treads[n - 1]!);
    treads.push(Number(tread.toFixed(6)));
    prevY = tread + sightlineHeight - bottomEdge;
  }
  return treads;
}

export function buildCinemaLayout(p: CinemaParams): CinemaLayout {
  const height = p.screen.width / p.screen.aspect;
  const screen = {
    width: p.screen.width,
    height,
    bottom: p.screen.bottomEdge,
    top: p.screen.bottomEdge + height,
    centre: { x: 0, y: p.screen.bottomEdge + height / 2, z: 0 },
  };

  const treads = solveTreads(p);
  const rows: CinemaRow[] = treads.map((tread, i) => {
    const eyeDistance = p.rows.firstRowEyeDistance + i * p.rows.rowPitch;
    const zBack =
      eyeDistance + p.eye.backOffset + (i === p.rows.count - 1 ? p.rows.lastRowExtraDepth : 0);
    return {
      index: i,
      label: ROW_LABELS[i] ?? `R${i + 1}`,
      eyeDistance,
      treadHeight: tread,
      riser: i === 0 ? 0 : tread - treads[i - 1]!,
      zFront: eyeDistance + p.eye.backOffset - p.rows.rowPitch,
      zBack,
    };
  });

  const xs = seatXPositions(p.seats);
  const seats: CinemaSeat[] = [];
  for (const row of rows) {
    xs.forEach((x, i) => {
      seats.push({
        id: `${row.label}${i + 1}`,
        rowIndex: row.index,
        number: i + 1,
        x,
        eye: { x, y: row.treadHeight + p.eye.cameraHeight, z: row.eyeDistance },
        sightlineEye: { x, y: row.treadHeight + p.eye.sightlineHeight, z: row.eyeDistance },
      });
    });
  }

  const seatSpan = Math.abs(xs[xs.length - 1]! - xs[0]!) + p.seats.seatPitch;
  const lastRow = rows[rows.length - 1]!;
  const room = {
    width: Math.max(seatSpan + 2 * p.seats.sideGangway, p.screen.width + 1),
    depth: lastRow.zBack,
    height: Math.max(screen.top + 0.6, lastRow.treadHeight + 2.6),
  };

  return { params: p, screen, rows, seats, room };
}
