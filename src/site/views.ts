import type { VenueKind } from '../booking/types';
import { bowlData, cinemaData } from '../booking/venues';
import { computeCinemaMetrics } from '../engine/cinema/metrics';
import { computeStadiumMetrics } from '../engine/stadium/metrics';

/**
 * One representative seat per venue, with a real render captured from the seat-view engine
 * (public/views/*.png, made by `?clean=1` captures) and its numbers computed live from the same engine.
 */
export interface SeatPreview {
  seat: string;
  image: string;
  label: string;
  coach: string; // stencil marker, e.g. M1
}

export const SEAT_PREVIEWS: Record<VenueKind, SeatPreview> = {
  cinema: { seat: 'K12', image: '/views/cinema-K12.png', label: 'Row K · Seat 12', coach: 'M1' },
  cricket: { seat: '101-10-11', image: '/views/cricket-101-10-11.png', label: 'Block 101 · Row 10 · Seat 11', coach: 'C1' },
  stadium: { seat: '103-17-35', image: '/views/football-103-17-35.png', label: 'Block 103 · Row 17 · Seat 35', coach: 'F1' },
  arena: { seat: '103-6-1', image: '/views/basketball-103-6-1.png', label: 'Block 103 · Row 6 · Seat 1', coach: 'B1' },
};

export interface SeatFigure {
  label: string;
  value: string;
}

const cache = new Map<VenueKind, SeatFigure[]>();

/** The seat's real measurements, as printed figures (computed once per venue). */
export function seatFigures(venue: VenueKind): SeatFigure[] {
  const hit = cache.get(venue);
  if (hit) return hit;
  const id = SEAT_PREVIEWS[venue].seat;
  let figs: SeatFigure[];
  if (venue === 'cinema') {
    const { layout } = cinemaData();
    const m = computeCinemaMetrics(layout, layout.seats.find((s) => s.id === id)!);
    figs = [
      { label: 'Screen fills', value: `${m.horizontalScreenAngle.toFixed(1)}°` },
      { label: 'To screen', value: `${m.distanceToScreenCentre.toFixed(1)} m` },
      { label: 'Clear of head in front', value: `${((m.sightlineClearance ?? 0) * 1000).toFixed(0)} mm` },
      { label: 'Eye height', value: '1.15 m' },
    ];
  } else {
    const { layout } = bowlData(venue);
    const m = computeStadiumMetrics(layout, layout.seatById.get(id)!);
    const area = venue === 'arena' ? 'Court' : venue === 'cricket' ? 'Ground' : 'Pitch';
    figs = [
      { label: `${area} in view`, value: `${m.pitchHorizontalAngle.toFixed(0)}°` },
      { label: venue === 'cricket' ? 'To boundary' : venue === 'arena' ? 'To sideline' : 'To touchline', value: `${m.distanceToFocal.toFixed(1)} m` },
      { label: 'Clear of head in front', value: `${((m.cValue ?? 0) * 1000).toFixed(0)} mm` },
      { label: 'Eye above surface', value: `${m.eyeHeightAbovePitch.toFixed(1)} m` },
    ];
  }
  cache.set(venue, figs);
  return figs;
}
