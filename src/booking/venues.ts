import { buildCinemaLayout, type CinemaLayout } from '../engine/cinema/layout';
import { DEMO_SCOPE_HALL } from '../engine/cinema/params';
import { buildStadiumLayout, type StadiumLayout } from '../engine/stadium/layout';
import {
  DEMO_BASKETBALL_ARENA,
  DEMO_CRICKET_GROUND,
  DEMO_FOOTBALL_STADIUM,
  type StadiumParams,
} from '../engine/stadium/params';
import { EVENTS } from './catalog';
import { bowlCategories, cinemaCategories, totalMinor, type SeatCategoryMap } from './pricing';
import type { VenueKind } from './types';

/**
 * Venue layouts and seat categories, built once on first use.
 * Pure TypeScript (no DOM, no three.js): used by both the browser and the server.
 */
export type BowlVenue = Exclude<VenueKind, 'cinema'>;

export const BOWL_PRESETS: Record<BowlVenue, StadiumParams> = {
  stadium: DEMO_FOOTBALL_STADIUM,
  arena: DEMO_BASKETBALL_ARENA,
  cricket: DEMO_CRICKET_GROUND,
};

let cinema: { layout: CinemaLayout; cats: SeatCategoryMap } | undefined;
const bowls = new Map<BowlVenue, { layout: StadiumLayout; cats: SeatCategoryMap }>();

export function cinemaData() {
  if (!cinema) {
    const layout = buildCinemaLayout(DEMO_SCOPE_HALL);
    cinema = { layout, cats: cinemaCategories(layout) };
  }
  return cinema;
}

export function bowlData(venue: BowlVenue) {
  let d = bowls.get(venue);
  if (!d) {
    const layout = buildStadiumLayout(BOWL_PRESETS[venue]);
    d = { layout, cats: bowlCategories(layout) };
    bowls.set(venue, d);
  }
  return d;
}

/** Football stadium (kept for existing callers). */
export function stadiumData() {
  return bowlData('stadium');
}

export function categoriesFor(eventId: string): SeatCategoryMap | undefined {
  const ev = EVENTS.find((e) => e.id === eventId);
  if (!ev) return undefined;
  return ev.venue === 'cinema' ? cinemaData().cats : bowlData(ev.venue).cats;
}

export function seatIdsFor(eventId: string): string[] | undefined {
  const cats = categoriesFor(eventId);
  return cats ? [...cats.keys()] : undefined;
}

export function priceFor(eventId: string, seatIds: string[]): { totalMinor: number; currency: string } {
  const ev = EVENTS.find((e) => e.id === eventId)!;
  return { totalMinor: totalMinor(ev, categoriesFor(eventId)!, seatIds), currency: ev.currency };
}
