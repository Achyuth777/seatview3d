import { toDeg, type Vec3 } from '../common/geometry';
import { pointOnSegment, sampleLoop, segmentLength, SEGMENT_KINDS } from './bowl';
import type { StadiumParams } from './params';

export interface StadiumRow {
  /** Global index across all tiers (0 = front row of tier 1). */
  index: number;
  tier: number; // 0-based
  rowInTier: number; // 1-based, as printed on tickets
  /** Horizontal distance from the boundary to the row's front edge. */
  frontOffset: number;
  /** Horizontal distance from the boundary to the eye point = focal distance D. */
  eyeOffset: number;
  treadHeight: number;
  /** Step from the previous row's tread (for a tier's first row: from the tier below / pitch). */
  riser: number;
  /** atan(riser / rowDepth) within a tier; null for a tier's first row. */
  rakeDeg: number | null;
  /** Front edge of the tier (balustrade line); equals frontOffset except for a first row behind a front gangway. */
  tierFrontOffset: number;
}

/** Underside of an upper tier that overhangs the tier below. */
export interface Soffit {
  tier: number; // the overhanging tier
  /** Front edge of the overhang (horizontal offset from the boundary). */
  frontOffset: number;
  /** Back of the tier below (the overhang covers rows between frontOffset and this). */
  backOffset: number;
  height: number;
}

export interface StadiumSeat {
  id: string; // `${section}-${row}-${seat}`, e.g. '103-12-7'
  section: number; // e.g. 103 = tier 1, section 3
  rowIndex: number; // global row index
  number: number; // seat number within the section row (1-based)
  segment: number;
  t: number; // position on the segment, 0..1
  plan: { x: number; z: number; nx: number; nz: number }; // eye point in plan + outward normal
  eye: Vec3;
  sightlineEye: Vec3;
}

export interface StadiumLayout {
  params: StadiumParams;
  rows: StadiumRow[];
  seats: StadiumSeat[];
  seatById: Map<string, StadiumSeat>;
  soffits: Soffit[];
  /** Roof canopy, resolved: from frontOffset to backOffset (behind the last row). */
  roof?: { frontOffset: number; backOffset: number; frontHeight: number; backHeight: number };
  /** Points on the playing-area boundary, used for viewing-distance and angle metrics. */
  boundary: { x: number; z: number }[];
  /** Design-rule problems found while solving (e.g. not enough headroom), for display. */
  warnings: string[];
}

/**
 * Solves tread heights tier by tier.
 * Within a tier, each riser is the smallest that gives the tier's target C over the row in front,
 * using the Green Guide formula solved for the riser:
 *     C = D(N + R)/(D + T) − R   ⇒   N = (C + R)(D + T)/D − R
 * (D = front row's eye distance to the focal point, R = front row's eye height above it, T = row depth),
 * then clamped between the tier's minimum rake and the 34° maximum, rounded up to `rounding`
 * without exceeding the cap.
 * An upper tier's first row rises at least `lift` above the tier below. When the tier sits behind the
 * tier below it also clears that tier's last row by the target C. When it overhangs (negative
 * setback), its underside must leave `minHeadroom` above every row beneath it.
 */
export function solveRows(p: StadiumParams): { rows: StadiumRow[]; soffits: Soffit[] } {
  const T = p.seating.rowDepth;
  const eyeIn = T - p.seating.eyeFromRear;
  const eyeH = p.eye.sightlineHeight;
  const capRise = Math.floor((T * Math.tan((p.maxRakeDeg * Math.PI) / 180)) / p.rounding) * p.rounding;
  const roundUp = (v: number) => Math.ceil(v / p.rounding - 1e-9) * p.rounding;

  const rows: StadiumRow[] = [];
  const soffits: Soffit[] = [];
  p.tiers.forEach((tier, ti) => {
    const minRise = T * Math.tan((tier.minRakeDeg * Math.PI) / 180);
    for (let r = 0; r < tier.rows; r++) {
      const prev = rows[rows.length - 1];
      let frontOffset: number;
      let tread: number;
      let rakeDeg: number | null = null;
      let tierFrontOffset: number;

      if (!prev) {
        frontOffset = p.pitch.runoff;
        tierFrontOffset = frontOffset;
        tread = tier.lift;
      } else if (r === 0) {
        const lowerBack = prev.frontOffset + T;
        tierFrontOffset = lowerBack + tier.setback;
        frontOffset = tierFrontOffset + (tier.frontGangway ?? 0);
        tread = prev.treadHeight + tier.lift;
        const eyeOffset = frontOffset + eyeIn;
        if (eyeOffset > prev.eyeOffset) {
          // Behind the tier below: also clear its last row by the target C.
          const R = prev.treadHeight + eyeH;
          const riseForC = ((R + tier.targetC) * eyeOffset) / prev.eyeOffset - R;
          tread = Math.max(tread, prev.treadHeight + roundUp(riseForC));
        }
        if (tierFrontOffset < lowerBack) {
          // Overhang: underside must clear every lower row it covers by minHeadroom.
          const covered = rows.filter((x) => x.tier === ti - 1 && x.frontOffset + T > tierFrontOffset);
          const highest = Math.max(...covered.map((x) => x.treadHeight));
          tread = Math.max(tread, roundUp(highest + p.minHeadroom + (tier.soffitDepth ?? 0)));
          soffits.push({ tier: ti, frontOffset: tierFrontOffset, backOffset: lowerBack, height: tread - (tier.soffitDepth ?? 0) });
        }
      } else {
        frontOffset = prev.frontOffset + T;
        tierFrontOffset = frontOffset;
        const D = prev.eyeOffset;
        const R = prev.treadHeight + eyeH;
        const Db = frontOffset + eyeIn;
        const riseForC = ((R + tier.targetC) * Db) / D - R; // N, from the C formula (Db = D + T)
        const rise = Math.min(roundUp(Math.max(riseForC, minRise)), capRise);
        tread = prev.treadHeight + rise;
        rakeDeg = toDeg(Math.atan(rise / T));
      }
      tread = Number(tread.toFixed(6));
      rows.push({
        index: rows.length,
        tier: ti,
        rowInTier: r + 1,
        frontOffset,
        eyeOffset: frontOffset + eyeIn,
        treadHeight: tread,
        riser: prev ? Number((tread - prev.treadHeight).toFixed(6)) : tread,
        rakeDeg,
        tierFrontOffset,
      });
    }
  });
  return { rows, soffits };
}

export function buildStadiumLayout(p: StadiumParams): StadiumLayout {
  const { length: L, width: W } = p.pitch;
  const r0 = p.pitch.cornerRadius ?? 0;
  const { rows, soffits } = solveRows(p);
  const T = p.seating.rowDepth;
  const warnings: string[] = [];

  const counts = SEGMENT_KINDS.map((k) => p.sections[k]);
  const sectionBase: number[] = [];
  counts.reduce((acc, n, i) => ((sectionBase[i] = acc), acc + n), 0);

  const seats: StadiumSeat[] = [];
  for (const row of rows) {
    const seatOffset = row.frontOffset + T / 2;
    const perSection = new Map<number, number>();
    for (let seg = 0; seg < 8; seg++) {
      const len = segmentLength(seg, L, W, seatOffset, r0);
      const n = Math.floor(len / p.seating.seatWidth);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const section =
          (row.tier + 1) * 100 + sectionBase[seg]! + Math.min(Math.floor(t * counts[seg]!), counts[seg]! - 1) + 1;
        const number = (perSection.get(section) ?? 0) + 1;
        perSection.set(section, number);
        const e = pointOnSegment(seg, t, L, W, row.eyeOffset, r0);
        seats.push({
          id: `${section}-${row.rowInTier}-${number}`,
          section,
          rowIndex: row.index,
          number,
          segment: seg,
          t,
          plan: e,
          eye: { x: e.x, y: row.treadHeight + p.eye.cameraHeight, z: e.z },
          sightlineEye: { x: e.x, y: row.treadHeight + p.eye.sightlineHeight, z: e.z },
        });
      }
    }
  }

  const last = rows[rows.length - 1]!;
  let roof: StadiumLayout['roof'];
  if (p.roof) {
    roof = { ...p.roof, backOffset: last.frontOffset + T + 1 };
    // The roof must clear every seat it covers.
    const tooLow = rows.filter(
      (r) => r.eyeOffset > p.roof!.frontOffset && r.treadHeight + p.minHeadroom > roofHeightAt(roof!, r.eyeOffset),
    );
    if (tooLow.length) warnings.push(`Roof is less than ${p.minHeadroom} m above ${tooLow.length} rows.`);
  }

  return {
    params: p,
    rows,
    seats,
    seatById: new Map(seats.map((s) => [s.id, s])),
    soffits,
    roof,
    boundary: sampleLoop(L, W, 0, r0, 8).map(({ x, z }) => ({ x, z })),
    warnings,
  };
}

/** Height of the (straight, sloping) roof canopy at a horizontal offset from the boundary. */
export function roofHeightAt(
  roof: { frontOffset: number; backOffset: number; frontHeight: number; backHeight: number },
  offset: number,
): number {
  const k = (offset - roof.frontOffset) / (roof.backOffset - roof.frontOffset);
  return roof.frontHeight + Math.min(Math.max(k, 0), 1) * (roof.backHeight - roof.frontHeight);
}
