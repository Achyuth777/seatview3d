import { useEffect, useState, type FormEvent } from 'react';
import { EVENTS, formatMoney, listingForEvent } from '../booking/catalog';
import { normalizeCustomer } from '../booking/customer';
import type { Booking } from '../booking/types';
import { bookingService } from '../booking/venueData';
import { ChartSheet, Stamp } from './chart';
import { formatWhen } from './format';
import { retryConnection, useAccount, useConnectionEpoch } from './platform';
import { forgetBooking, rememberBooking, updateProfile, useProfile } from './profileStore';
import { Link } from './router';

type Loaded = { state: 'loading' } | { state: 'ok'; booking: Booking } | { state: 'missing' } | { state: 'error' };

/** Demo tickets and checkout details kept in this browser. */
export function Profile({ embedded = false }: { embedded?: boolean }) {
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [saved, setSaved] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Record<string, Loaded>>({});

  const { status } = useAccount();
  const epoch = useConnectionEpoch();

  useEffect(() => {
    let live = true;
    for (const b of profile.bookings) {
      // A failed fetch is retried when the connection is re-checked.
      if (tickets[b.reference] && tickets[b.reference]!.state !== 'error') continue;
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
  }, [profile.bookings, epoch]);

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
    <div className={embedded ? 'profile' : 'page profile'}>
      <div className="profile__grid">
        <section aria-labelledby="tickets-title" className="profile__tickets">
          <h2 id="tickets-title" className="section-title section-title--small">
            {profile.bookings.length ? `${profile.bookings.length} ${profile.bookings.length === 1 ? 'demo ticket' : 'demo tickets'} in this browser` : 'No demo tickets yet'}
          </h2>
          {profile.bookings.length === 0 && (
            <p className="empty empty--steel">
              Book a sample seat and its demo ticket appears here. <Link to="/">Find a show or a match</Link>, or add a demo
              booking with its reference.
            </p>
          )}
          {profile.bookings.map((b) => (
            <Ticket key={b.reference} reference={b.reference} eventId={b.eventId} loaded={tickets[b.reference]} deviceOnly={status === 'frontend-only'} />
          ))}
          {status === 'unavailable' ? (
            <div className="find" data-lookup="needs-server">
              <h3 className="find__title">Add a booking by reference</h3>
              <p>Looking up a booking needs the SeatView server, which isn’t responding. Tickets already saved on this device stay listed above.</p>
              <button type="button" className="btn btn--seat" onClick={retryConnection}>Try again</button>
            </div>
          ) : (
            <FindBooking defaultEmail={profile.email} deviceOnly={status === 'frontend-only'} checking={status === 'loading'} />
          )}
        </section>

        <ChartSheet className="profile__details">
          <h2 className="sheet__title">Checkout details (this browser)</h2>
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

function Ticket({ reference, eventId, loaded, deviceOnly }: { reference: string; eventId: string; loaded?: Loaded; deviceOnly: boolean }) {
  if (!loaded || loaded.state === 'loading') {
    return <article className="ticket ticket--loading" aria-busy="true"><span className="ticket__ref">{reference}</span> Fetching ticket…</article>;
  }
  if (loaded.state === 'error') {
    // An outage must not look like a lost ticket, so keep what this device knows and offer no removal.
    const event = EVENTS.find((x) => x.id === eventId);
    const listing = listingForEvent(eventId);
    return (
      <article className="ticket ticket--problem" data-ticket="saved-offline">
        <span className="ticket__ref">{reference}</span>
        <h3 className="ticket__title">{listing?.title ?? eventId}</h3>
        <p className="ticket__meta">{event ? formatWhen(event.startsAt) : ''}{listing ? ` · ${listing.venueName}` : ''}</p>
        <p>Saved on this device. Seats and total will appear when the server is back.</p>
      </article>
    );
  }
  if (loaded.state === 'missing') {
    return (
      <article className="ticket ticket--problem">
        <span className="ticket__ref">{reference}</span>
        <p>{deviceOnly ? 'This ticket’s details aren’t stored in this browser.' : 'This booking was not found with the saved email.'}</p>
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

function FindBooking({ defaultEmail, deviceOnly, checking }: { defaultEmail: string; deviceOnly: boolean; checking: boolean }) {
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
      if (!found) setMsg({ ok: false, text: deviceOnly ? 'No ticket with that reference and email is stored in this browser.' : 'No booking matches that reference and email. Check both and try again.' });
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
      <h3 className="find__title">{deviceOnly ? 'Find a ticket on this device' : 'Add a booking by reference'}</h3>
      {deviceOnly && (
        <p id="find-scope" className="find__scope">
          This version has no server, so this finds only demo tickets booked in this browser. Tickets from another device or browser can’t be found here.
        </p>
      )}
      <div className="find__fields" aria-describedby={deviceOnly ? 'find-scope' : undefined} role="group">
        <label>
          Reference
          <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="SV-XXXXXX" maxLength={9} required />
        </label>
        <label>
          Email used at checkout
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" className="btn btn--seat" disabled={busy || checking}>{busy ? 'Looking…' : deviceOnly ? 'Find on this device' : 'Find booking'}</button>
      </div>
      {msg && <p className={msg.ok ? 'form__ok' : 'form__error'} role="status">{msg.text}</p>}
    </form>
  );
}
