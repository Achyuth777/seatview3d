import { useEffect, useState, type FormEvent } from 'react';
import { EVENTS, formatMoney, listingForEvent } from '../booking/catalog';
import { normalizeCustomer } from '../booking/customer';
import type { Booking } from '../booking/types';
import { bookingService } from '../booking/venueData';
import { ChartSheet, Stamp } from './chart';
import { formatWhen } from './format';
import { forgetBooking, rememberBooking, updateProfile, useProfile } from './profileStore';
import { Link } from './router';

type Loaded = { state: 'loading' } | { state: 'ok'; booking: Booking } | { state: 'missing' } | { state: 'error' };

export function Profile() {
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [saved, setSaved] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Record<string, Loaded>>({});

  useEffect(() => {
    let live = true;
    for (const b of profile.bookings) {
      if (tickets[b.reference]) continue;
      setTickets((t) => ({ ...t, [b.reference]: { state: 'loading' } }));
      bookingService
        .findBooking(b.reference, b.email)
        .then((found) => live && setTickets((t) => ({ ...t, [b.reference]: found ? { state: 'ok', booking: found } : { state: 'missing' } })))
        .catch(() => live && setTickets((t) => ({ ...t, [b.reference]: { state: 'error' } })));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.bookings]);

  const saveDetails = (e: FormEvent) => {
    e.preventDefault();
    try {
      const c = normalizeCustomer({ name, email });
      updateProfile(c);
      setName(c.name);
      setEmail(c.email);
      setFormError(null);
      setSaved('Saved in this browser. Checkout will be filled in for you.');
    } catch (err) {
      setSaved(null);
      setFormError((err as Error).message);
    }
  };

  return (
    <div className="page profile">
      <header className="page__head">
        <span className="page__coach" aria-hidden="true">PNR</span>
        <h1 className="page__title">Your tickets</h1>
        <p className="page__lede">
          Your details and tickets are kept in this browser only. There is no account and no password.
        </p>
      </header>

      <div className="profile__grid">
        <section aria-labelledby="tickets-title" className="profile__tickets">
          <h2 id="tickets-title" className="section-title section-title--small">
            {profile.bookings.length ? `${profile.bookings.length} ${profile.bookings.length === 1 ? 'ticket' : 'tickets'}` : 'No tickets yet'}
          </h2>
          {profile.bookings.length === 0 && (
            <p className="empty empty--steel">
              Book a seat and its ticket appears here. <Link to="/">Find a show or a match</Link>, or add a booking you made
              elsewhere with its reference.
            </p>
          )}
          {profile.bookings.map((b) => (
            <Ticket key={b.reference} reference={b.reference} loaded={tickets[b.reference]} />
          ))}
          <FindBooking defaultEmail={profile.email} />
        </section>

        <ChartSheet className="profile__details">
          <h2 className="sheet__title">Your details</h2>
          <form onSubmit={saveDetails} noValidate className="form">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} />
            </label>
            {formError && <p className="form__error" role="alert">{formError}</p>}
            {saved && <p className="form__ok" role="status">{saved}</p>}
            <button type="submit" className="btn btn--ink">Save details</button>
          </form>
        </ChartSheet>
      </div>
    </div>
  );
}

function Ticket({ reference, loaded }: { reference: string; loaded?: Loaded }) {
  if (!loaded || loaded.state === 'loading') {
    return <article className="ticket ticket--loading" aria-busy="true"><span className="ticket__ref">{reference}</span> Fetching ticket…</article>;
  }
  if (loaded.state !== 'ok') {
    return (
      <article className="ticket ticket--problem">
        <span className="ticket__ref">{reference}</span>
        <p>
          {loaded.state === 'missing' ? 'This booking was not found with the saved email.' : 'Could not reach the booking server. Try again later.'}
        </p>
        <button type="button" className="btn btn--quiet" onClick={() => forgetBooking(reference)}>Remove from this browser</button>
      </article>
    );
  }
  const b = loaded.booking;
  const e = EVENTS.find((x) => x.id === b.eventId);
  const l = listingForEvent(b.eventId);
  return (
    <article className="ticket">
      <div className="ticket__main">
        <span className="ticket__ref">{b.reference}</span>
        <h3 className="ticket__title">{l?.title ?? b.eventId}</h3>
        <p className="ticket__meta">{e ? formatWhen(e.startsAt) : ''} · {l?.venueName}</p>
        <p className="ticket__seats">
          {b.seatIds.length} {b.seatIds.length === 1 ? 'seat' : 'seats'}: <span>{b.seatIds.join(', ')}</span>
        </p>
      </div>
      <div className="ticket__stub">
        <Stamp>CNF</Stamp>
        <span className="ticket__total">{formatMoney(b.totalMinor, b.currency)}</span>
        <Link to={`/book/${b.eventId}?seat=${encodeURIComponent(b.seatIds[0]!)}`} className="btn btn--seat">See your seat</Link>
      </div>
    </article>
  );
}

function FindBooking({ defaultEmail }: { defaultEmail: string }) {
  const [ref, setRef] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const found = await bookingService.findBooking(ref, email);
      if (!found) setMsg({ ok: false, text: 'No booking matches that reference and email. Check both and try again.' });
      else {
        rememberBooking({ reference: found.reference, email: email.trim().toLowerCase(), eventId: found.eventId });
        setMsg({ ok: true, text: `Added ${found.reference}.` });
        setRef('');
      }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the booking server. Try again later.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="find" onSubmit={submit}>
      <h3 className="find__title">Add a booking by reference</h3>
      <div className="find__fields">
        <label>
          Reference
          <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="SV-XXXXXX" maxLength={9} required />
        </label>
        <label>
          Email used at checkout
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" className="btn btn--seat" disabled={busy}>{busy ? 'Looking…' : 'Find booking'}</button>
      </div>
      {msg && <p className={msg.ok ? 'form__ok' : 'form__error'} role="status">{msg.text}</p>}
    </form>
  );
}
