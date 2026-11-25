import type { CinemaLayout, CinemaRow, CinemaSeat } from '../engine/cinema/layout';
import { solveTreads } from '../engine/cinema/layout';
import { DEMO_SCOPE_HALL, type CinemaParams } from '../engine/cinema/params';
import { numberRow, type SeatGrid } from './grid';

/** Everything the page doesn't tell us. Shown to the visitor next to the view. */
export const ASSUMED = {
  seatPitch: 0.55, // m, seat centre to seat centre [assumed]
  rowPitch: 1.05, // m, back-to-back [assumed]
  screenToSeatSpan: 0.85, // screen width as a share of the seating width [assumed]
  minScreen: 8,
  maxScreen: 20,
  firstRowMin: 4.5, // m from the screen to the front-row eye [assumed], never less than UNIC's 0.6 x W
};

export interface GridLayout {
  layout: CinemaLayout;
  assumptions: string[];
}

/**
 * Builds a 3D hall from a booking page's real seat map: real rows, seats per row, aisles and seat
 * numbers. Distances, screen size and step heights are not on the page, so they are assumed (rows
 * stepped by the same sightline solver as the demo hall) and listed in `assumptions`.
 */
export function layoutFromGrid(grid: SeatGrid, opts: { imax?: boolean } = {}): GridLayout {
  const pageRows = grid.rows.map(numberRow).filter((r) => r.slots.some((s) => s.kind === 'seat'));
  if (!pageRows.length) throw new Error('No seats found on the page');
  const front = grid.screenAtBottom ? [...pageRows].reverse() : pageRows;

  const xs = front.flatMap((r) => r.slots.filter((s) => s.kind === 'seat').map((s) => s.x));
  const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
  const seatSpan = (Math.max(...xs) - Math.min(...xs) + 1) * ASSUMED.seatPitch;
  const screenWidth = Math.round(Math.min(ASSUMED.maxScreen, Math.max(ASSUMED.minScreen, seatSpan * ASSUMED.screenToSeatSpan)) * 10) / 10;
  const aspect = opts.imax ? 1.9 : 2.39;

  const params: CinemaParams = {
    ...DEMO_SCOPE_HALL,
    name: 'Rebuilt from the booking seat map',
    screen: { ...DEMO_SCOPE_HALL.screen, width: screenWidth, aspect },
    rows: { ...DEMO_SCOPE_HALL.rows, count: front.length, rowPitch: ASSUMED.rowPitch, firstRowEyeDistance: Math.max(ASSUMED.firstRowMin, 0.6 * screenWidth) },
    seats: { ...DEMO_SCOPE_HALL.seats, seatPitch: ASSUMED.seatPitch, blocks: [Math.max(...front.map((r) => r.slots.length))] },
  };
  const height = screenWidth / aspect;
  const screen = { width: screenWidth, height, bottom: params.screen.bottomEdge, top: params.screen.bottomEdge + height, centre: { x: 0, y: params.screen.bottomEdge + height / 2, z: 0 } };
  const treads = solveTreads(params);

  const rows: CinemaRow[] = front.map((r, i) => {
    const eyeDistance = params.rows.firstRowEyeDistance + i * params.rows.rowPitch;
    return {
      index: i,
      label: r.label,
      eyeDistance,
      treadHeight: treads[i]!,
      riser: i === 0 ? 0 : treads[i]! - treads[i - 1]!,
      zFront: eyeDistance + params.eye.backOffset - params.rows.rowPitch,
      zBack: eyeDistance + params.eye.backOffset + (i === front.length - 1 ? params.rows.lastRowExtraDepth : 0),
    };
  });

  const seats: CinemaSeat[] = [];
  front.forEach((r, i) => {
    const row = rows[i]!;
    for (const s of r.slots) {
      if (s.kind !== 'seat') continue;
      const x = (s.x - centre) * ASSUMED.seatPitch;
      seats.push({
        id: `${r.label}${s.number}`,
        rowIndex: i,
        number: s.number!,
        x,
        eye: { x, y: row.treadHeight + params.eye.cameraHeight, z: row.eyeDistance },
        sightlineEye: { x, y: row.treadHeight + params.eye.sightlineHeight, z: row.eyeDistance },
      });
    }
  });

  const last = rows[rows.length - 1]!;
  const room = { width: Math.max(seatSpan + 2 * params.seats.sideGangway, screenWidth + 1), depth: last.zBack, height: Math.max(screen.top + 0.6, last.treadHeight + 2.6) };

  return {
    layout: { params, screen, rows, seats, room },
    assumptions: [
      `Rows, seats per row, aisles and seat numbers come from the live seat map (${front.length} rows, ${seats.length} seats).`,
      `Screen ${screenWidth.toFixed(1)} m wide at ${aspect}:1, estimated from the seating width.`,
      `Row spacing ${ASSUMED.rowPitch} m, seat spacing ${ASSUMED.seatPitch} m, front row ${params.rows.firstRowEyeDistance.toFixed(1)} m from the screen.`,
      'Step heights are calculated for good sightlines, not measured.',
    ],
  };
}
