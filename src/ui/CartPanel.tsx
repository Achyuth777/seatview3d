import { useState, type FormEvent } from 'react';
import { formatMoney } from '../booking/catalog';
import { normalizeCustomer } from '../booking/customer';
import { categoryOf, totalMinor, type SeatCategoryMap } from '../booking/pricing';
import type { BookingState } from '../booking/useBooking';
import type { EventInfo } from '../booking/types';
import { CloseIcon } from './Icons';

interface Props {
  event: EventInfo;
  cats: SeatCategoryMap;
  booking: BookingState;
  onView: (seatId: string) => void;
  /** Pre-fills checkout from the local profile. */
  initialCustomer?: { name: string; email: string };
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function CartPanel({ event, cats, booking, onView, initialCustomer }: Props) {
  const { cart, secondsLeft, stage, error } = booking;
  const money = (m: number) => formatMoney(m, event.currency);
  const [name, setName] = useState(initialCustomer?.name ?? '');
  const [email, setEmail] = useState(initialCustomer?.email ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      const customer = normalizeCustomer({ name, email }); // same rules the server enforces
      setFormError(null);
      void booking.confirm(customer);
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  if (stage === 'confirmed' && booking.booking) {
    const b = booking.booking;
    return (
      <div className="cart">
        <div className="title">Booking confirmed</div>
        <span className="stamp stamp--red cart__cnf">CNF</span>
        <div className="ref">{b.reference}</div>
        <div className="muted">
          {event.title} · {when(event.startsAt)}
        </div>
        <ul>
          {b.seatIds.map((id) => (
            <li key={id}>
              <button className="link" onClick={() => onView(id)}>
                {id}
              </button>{' '}
              <span className="muted">{categoryOf(event, cats, id)?.label}</span>
            </li>
          ))}
        </ul>
        <div className="total">Total {money(b.totalMinor)}</div>
        {b.customer && (
          <div className="muted">
            For {b.customer.name} · {b.customer.email}
          </div>
        )}
        <div className="muted">Demo: no payment was taken.</div>
        <button onClick={booking.done}>Done</button>
      </div>
    );
  }

  return (
    <div className={cart.length === 0 && !error ? 'cart cart--empty' : 'cart'}>
      <div className="title">{event.title}</div>
      <div className="muted">{when(event.startsAt)}</div>

      {cart.length === 0 ? (
        <div className="hint">Click a seat, check the view, then “Add to cart”.</div>
      ) : (
        <>
          <ul>
            {cart.map((id) => {
              const cat = categoryOf(event, cats, id);
              return (
                <li key={id}>
                  <button className="link" onClick={() => onView(id)} title="Show the view from this seat">
                    {id}
                  </button>{' '}
                  <span className="muted">{cat?.label}</span> <span className="price">{cat && money(cat.priceMinor)}</span>
                  {stage === 'select' && (
                    <button className="x" onClick={() => void booking.toggleSeat(id)} title="Remove">
                      <CloseIcon />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="total">
            {cart.length} seat{cart.length > 1 ? 's' : ''} · {money(totalMinor(event, cats, cart))}
          </div>
          {secondsLeft !== null && (
            <div className="cart__held">
              <span className="stamp stamp--red" role="timer">
                Held {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
            </div>
          )}
          {stage === 'select' ? (
            <button className="primary" onClick={booking.checkout}>
              Checkout
            </button>
          ) : (
            <form className="checkout" onSubmit={submit} noValidate>
              <label>
                Name
                <input value={name} onChange={(e) => { setName(e.target.value); setFormError(null); }} autoComplete="name" maxLength={100} required />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
              <div className="muted">Used only for this booking; no emails are sent. This demo takes no payment.</div>
              {formError && <div className="error">{formError}</div>}
              <button className="primary" type="submit">
                Confirm booking
              </button>{' '}
              <button type="button" onClick={booking.back}>
                Back
              </button>
            </form>
          )}
        </>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
