import type { CinemaLayout } from '../engine/cinema/layout';
import { SEGMENT_KINDS } from '../engine/stadium/bowl';
import type { StadiumLayout } from '../engine/stadium/layout';
import type { EventInfo, PriceCategory } from './types';

/** Seat id → price category id, for every seat of a venue layout. */
export type SeatCategoryMap = Map<string, string>;

/** Cinema: rows A–C front, D–K standard, L onward premium (by row index: 0–2, 3–9, 10+). */
export function cinemaCategories(layout: CinemaLayout): SeatCategoryMap {
  return new Map(
    layout.seats.map((s) => [s.id, s.rowIndex <= 2 ? 'front' : s.rowIndex <= 9 ? 'standard' : 'premium']),
  );
}

/**
 * Bowl venues (stadium, arena, cricket): tier × position. Football/basketball: sides vs ends & corners.
 * Cricket (oval): "square of the wicket" = within 45° of the line across the ground, else behind the bowler.
 */
export function bowlCategories(layout: StadiumLayout): SeatCategoryMap {
  const cricket = layout.params.sport === 'cricket';
  return new Map(
    layout.seats.map((s) => {
      const tier = layout.rows[s.rowIndex]!.tier;
      const prime = cricket ? Math.abs(s.plan.z) >= Math.abs(s.plan.x) : SEGMENT_KINDS[s.segment] === 'side';
      return [s.id, tier === 0 ? (prime ? 'cat1' : 'cat2') : prime ? 'cat3' : 'cat4'];
    }),
  );
}

/** @deprecated Phase 4 name; same as bowlCategories. */
export function stadiumCategories(layout: StadiumLayout): SeatCategoryMap {
  return bowlCategories(layout);
}

export function categoryOf(event: EventInfo, cats: SeatCategoryMap, seatId: string): PriceCategory | undefined {
  const id = cats.get(seatId);
  return event.categories.find((c) => c.id === id);
}

export function totalMinor(event: EventInfo, cats: SeatCategoryMap, seatIds: string[]): number {
  return seatIds.reduce((sum, id) => sum + (categoryOf(event, cats, id)?.priceMinor ?? 0), 0);
}
