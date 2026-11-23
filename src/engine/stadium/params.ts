/**
 * Parameters of a stadium/arena bowl. All lengths in metres, angles in degrees.
 *
 * Coordinate system used by the whole stadium module:
 *   origin = centre of the playing area at playing-surface level, +X along its length, +Z across, +Y up.
 */
export type Sport = 'football' | 'basketball' | 'cricket';

export interface TierParams {
  name: string;
  rows: number;
  /**
   * Tier 1: tread height of its front row above the playing surface.
   * Upper tiers: minimum vertical step from the last row of the tier below.
   */
  lift: number;
  /**
   * Upper tiers: horizontal gap between the back of the tier below and this tier's front row.
   * Negative = the tier overhangs (cantilevers over) the back of the tier below by that much.
   */
  setback: number;
  /** Target sightline C value (metres) the risers are solved for. */
  targetC: number;
  /** Minimum rake; risers are never flatter than this. */
  minRakeDeg: number;
  /** Upper tiers: height of the solid front balustrade above the first row's tread. */
  parapetHeight?: number;
  /** Upper tiers: structural depth between this tier's first tread and its underside (soffit). */
  soffitDepth?: number;
  /**
   * Upper tiers: walkway between the front balustrade and the first row. Moving the first row back
   * from the balustrade is the usual fix when the balustrade hides the near touchline.
   */
  frontGangway?: number;
}

export interface StadiumParams {
  name: string;
  sport: Sport;
  pitch: {
    /** Inner rectangle of the playing-area boundary (football pitch / basketball court). */
    length: number;
    width: number;
    /** Corner radius of the boundary (0 = rectangle; cricket: the boundary radius). */
    cornerRadius?: number;
    /** Distance from the boundary to the front edge of the first seating row. */
    runoff: number;
  };
  seating: {
    /** Seating row depth T. Green Guide §12.13: >= 700 mm, >= 800 mm recommended. */
    rowDepth: number;
    /** Seat width along the row. Green Guide §12.13: >= 460 mm, 500 mm recommended. */
    seatWidth: number;
    /** Eye point distance from the rear of the row. */
    eyeFromRear: number;
  };
  eye: {
    /** Camera eye height above the tread (project spec ~1.15 m seated). */
    cameraHeight: number;
    /** Eye height used for sightline (C value) calculations. */
    sightlineHeight: number;
  };
  /** Steepest rake allowed. Green Guide 5th ed. §13.11: 34° for seating. */
  maxRakeDeg: number;
  /** Minimum clear height between a tread and an overhanging tier's underside [assumed]. */
  minHeadroom: number;
  /** Riser construction step; risers are rounded up to it (but never past the rake cap). */
  rounding: number;
  /** Section counts per segment of the bowl: [side, corner, end] (same for every tier). */
  sections: { side: number; corner: number; end: number };
  /** Advertising boards around the playing area (omit for none). */
  boards?: { height: number; offset: number };
  /** Roof: a canopy from `frontOffset` back over the stands (omit for none / open air). */
  roof?: { frontOffset: number; frontHeight: number; backHeight: number };
  tiers: TierParams[];
}

/** Generic two-tier football stadium. Values marked [assumed] are engineering choices, not standards. */
export const DEMO_FOOTBALL_STADIUM: StadiumParams = {
  name: 'Demo football stadium (2 tiers, 105 × 68 m pitch)',
  sport: 'football',
  pitch: {
    length: 105, // FIFA Stadium Guidelines §5.3
    width: 68, // FIFA Stadium Guidelines §5.3
    runoff: 8, // [assumed] uniform run-off to the front row
  },
  seating: {
    rowDepth: 0.8, // Green Guide §12.13 recommended minimum (BS EN 13200)
    seatWidth: 0.5, // Green Guide §12.13 recommended
    eyeFromRear: 0.15, // [secondary] Parametric Monkey "industry standard"
  },
  eye: {
    cameraHeight: 1.15, // project spec
    sightlineHeight: 1.2, // [secondary] Parametric Monkey "industry standard"
  },
  maxRakeDeg: 34, // Green Guide 5th ed. §13.11
  minHeadroom: 2.5, // [assumed]
  rounding: 0.01, // [assumed]
  sections: { side: 6, corner: 2, end: 4 }, // [assumed]
  boards: { height: 0.9, offset: 5 }, // [assumed] typical LED board height and position
  roof: { frontOffset: 16, frontHeight: 27, backHeight: 29 }, // [assumed] cantilevered roof
  tiers: [
    {
      name: 'Lower',
      rows: 25, // [assumed]
      lift: 1.0, // [assumed] front-row tread 1.0 m above the pitch
      setback: 0,
      targetC: 0.09, // 90 mm "good" (FIFA/UEFA guidance, [secondary])
      minRakeDeg: 15, // [assumed]
    },
    {
      name: 'Upper',
      rows: 20, // [assumed]
      lift: 3.0, // [assumed] minimum step; raised automatically for headroom under the overhang
      // [assumed] cantilevers 1.5 m over the back of the lower tier. A 4 m overhang pulls the tier so
      // close that its back rows would need a rake steeper than 34° (C drops to 36 mm); see Phase 8 report.
      setback: -1.5,
      targetC: 0.09,
      minRakeDeg: 20, // [assumed]
      // [assumed] opaque part of the balcony front (low upstand, glass above). A solid 0.8 m front
      // would leave the first row only 16–45 mm of clearance to the near touchline.
      parapetHeight: 0.5,
      soffitDepth: 1.0, // [assumed] structure + finishes
    },
  ],
};

/** Basketball arena around an NBA court (94 × 50 ft = 28.65 × 15.24 m). Indoor: no roof modelled. */
export const DEMO_BASKETBALL_ARENA: StadiumParams = {
  name: 'Demo basketball arena (2 tiers, 28.65 × 15.24 m court)',
  sport: 'basketball',
  pitch: { length: 28.65, width: 15.24, runoff: 5 }, // NBA court [secondary]; 5 m to front row [assumed]
  seating: { rowDepth: 0.8, seatWidth: 0.5, eyeFromRear: 0.15 },
  eye: { cameraHeight: 1.15, sightlineHeight: 1.2 },
  maxRakeDeg: 34,
  minHeadroom: 2.5,
  rounding: 0.01,
  sections: { side: 4, corner: 2, end: 2 }, // [assumed]
  tiers: [
    // [assumed] Close to a small court the rake cap (34°) binds quickly, so tiers are short, the target
    // C is the 60 mm minimum, and the upper tier sits behind (not over) the lower one; see Phase 8 report.
    { name: 'Lower', rows: 12, lift: 0.3, setback: 0, targetC: 0.06, minRakeDeg: 15 },
    {
      name: 'Upper',
      rows: 10,
      lift: 3.0,
      setback: 1,
      targetC: 0.06,
      minRakeDeg: 22,
      parapetHeight: 0.5,
      soffitDepth: 1.0,
    },
  ],
};

/**
 * Cricket ground. Boundary: an oval 73 m from the centre at the ends and 68 m at the sides, within
 * the men's international limits (≤ 90 yd / 82.3 m, should be ≥ 65 yd / 59.4 m; ICC clause 19,
 * [secondary]). Focal point: the boundary rope (stricter than the Green Guide's "further infield").
 */
export const DEMO_CRICKET_GROUND: StadiumParams = {
  name: 'Demo cricket ground (2 tiers, 73 × 68 m boundary)',
  sport: 'cricket',
  pitch: { length: 10, width: 0, cornerRadius: 68, runoff: 6 }, // [assumed]
  seating: { rowDepth: 0.8, seatWidth: 0.5, eyeFromRear: 0.15 },
  eye: { cameraHeight: 1.15, sightlineHeight: 1.2 },
  maxRakeDeg: 34,
  minHeadroom: 2.5,
  rounding: 0.01,
  sections: { side: 1, corner: 6, end: 1 }, // [assumed]; ends have zero length on this oval
  boards: { height: 0.9, offset: 3 }, // [assumed] boards just behind the rope
  roof: { frontOffset: 26, frontHeight: 22, backHeight: 24 }, // [assumed] canopy over the upper tier
  tiers: [
    // [assumed] Front-row tread 1.3 m so row 1 sees over the 0.9 m boards (at 0.8 m it saw 0 mm over them).
    { name: 'Lower', rows: 20, lift: 1.3, setback: 0, targetC: 0.06, minRakeDeg: 12 },
    {
      name: 'Upper',
      rows: 14,
      lift: 3.0,
      setback: 1.5,
      targetC: 0.06,
      minRakeDeg: 18,
      parapetHeight: 0.5,
      soffitDepth: 1.0,
    }, // [assumed]
  ],
};
