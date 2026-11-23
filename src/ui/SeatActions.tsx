import { formatMoney } from '../booking/catalog';
import { categoryOf, type SeatCategoryMap } from '../booking/pricing';
import type { BookingState } from '../booking/useBooking';
import type { EventInfo } from '../booking/types';

/** Price, availability and the add/remove button for the seat being viewed. */
export function SeatActions({
  event,
  cats,
  booking,
  seatId,
}: {
  event: EventInfo;
  cats: SeatCategoryMap;
  booking: BookingState;
  seatId: string;
}) {
  const cat = categoryOf(event, cats, seatId);
  const state = booking.states.get(seatId) ?? 'available';
  const locked = booking.stage !== 'select';

  return (
    <div className="actions">
      <span>
        {cat?.label} · <b>{cat && formatMoney(cat.priceMinor, event.currency)}</b>
      </span>{' '}
      {state === 'sold' && <span className="stamp stamp--red stamp--small stamp--struck">Sold</span>}
      {state === 'held' && <span className="stamp stamp--red stamp--small">Held by another customer</span>}
      {state === 'available' && (
        <button className="primary" disabled={locked} onClick={() => void booking.toggleSeat(seatId)}>
          Add to cart
        </button>
      )}
      {state === 'cart' && (
        <button disabled={locked} onClick={() => void booking.toggleSeat(seatId)}>
          Remove from cart
        </button>
      )}
    </div>
  );
}
