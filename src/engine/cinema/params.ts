/**
 * Parameters of a cinema auditorium. All lengths in metres.
 *
 * Coordinate system used by the whole cinema module:
 *   origin = centre of the screen's bottom picture line projected to the front floor level (y = 0),
 *   +X = to the viewer's right when facing the screen, +Y = up, +Z = from the screen towards the audience.
 *   The screen lies in the plane z = 0.
 */
export interface CinemaParams {
  name: string;
  screen: {
    /** Picture width W (the widest format the screen shows). */
    width: number;
    /** Width / height, e.g. 2.39 (Scope), 1.85 (Flat), 1.43 (IMAX). */
    aspect: number;
    /** Height of the bottom picture line above the front floor (row-1 tread). */
    bottomEdge: number;
  };
  rows: {
    count: number;
    /** Horizontal distance from the screen plane to the row-1 eye point. UNIC §4.1: >= 0.6 x W. */
    firstRowEyeDistance: number;
    /** Back-to-back row distance. UNIC §5.1: >= 1.2 m for regular seating. */
    rowPitch: number;
    /** Extra depth behind the last row. UNIC §5.1.2: 150-200 mm. */
    lastRowExtraDepth: number;
  };
  seats: {
    /** Centre-to-centre seat spacing within a row. */
    seatPitch: number;
    /** Seats per block, left to right (viewer's view). Blocks are separated by aisles. */
    blocks: number[];
    aisleWidth: number;
    /** Side gangway between the outermost seat and the side wall. */
    sideGangway: number;
  };
  eye: {
    /** Camera eye height above the tread (your Phase 2 spec: ~1.15 m seated). */
    cameraHeight: number;
    /** Reference eye height used for sightline clearance. UNIC §4.7: 1200 mm. */
    sightlineHeight: number;
    /** Eye point is this far in front of the row's back line (towards the screen). */
    backOffset: number;
  };
  risers: {
    /** Target sightline clearance c when solving riser heights. UNIC §4.7: >= 200 mm is "good". */
    targetClearance: number;
    /** Built risers are rounded UP to this step. */
    rounding: number;
  };
}

/**
 * Demo hall: a mid-size Scope (2.39:1) auditorium.
 * Values marked [assumed] are engineering choices, not taken from a standard.
 */
export const DEMO_SCOPE_HALL: CinemaParams = {
  name: 'Demo Scope hall (2.39:1, 14 m screen)',
  screen: {
    width: 14, // [assumed] typical mid-size multiplex screen
    aspect: 2.39, // DCI Scope
    bottomEdge: 1.0, // [assumed]
  },
  rows: {
    count: 14, // [assumed]
    firstRowEyeDistance: 8.4, // = 0.6 x W, the UNIC §4.1 comfort limit
    rowPitch: 1.2, // UNIC §5.1 minimum for good leg room
    lastRowExtraDepth: 0.2, // UNIC §5.1.2
  },
  seats: {
    seatPitch: 0.6, // [assumed] 0.55 m seat + armrest share
    blocks: [5, 14, 5], // [assumed]
    aisleWidth: 1.2, // [assumed]
    sideGangway: 1.2, // [assumed]
  },
  eye: {
    cameraHeight: 1.15, // project spec
    sightlineHeight: 1.2, // UNIC §4.7
    backOffset: 0.15, // [assumed]
  },
  risers: {
    targetClearance: 0.2, // UNIC §4.7 "good" threshold
    rounding: 0.01, // [assumed] 10 mm construction step
  },
};
