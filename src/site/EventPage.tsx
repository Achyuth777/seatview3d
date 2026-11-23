import { EVENTS, formatMoney, listingById } from '../booking/catalog';
import { LiveryPlate } from './art';
import { ChartSheet, PreviewPanel } from './chart';
import { formatDate, formatTime } from './format';
import { Link } from './router';
import { SEAT_PREVIEWS } from './views';
import { NotFound } from './NotFound';

export function EventPage({ id }: { id: string }) {
  const listing = listingById(id);
  if (!listing) return <NotFound />;
  const sessions = listing.sessions.map((s) => EVENTS.find((e) => e.id === s.id)!);
  const cats = sessions[0]!.categories;
  const preview = SEAT_PREVIEWS[listing.venue];

  return (
    <div className="page event">
      <section className="event__head">
        <LiveryPlate listing={listing} size="lg" />
        <div className="event__intro">
          <h1 className="event__title">{listing.title}</h1>
          <p className="event__sub">{listing.subtitle}</p>
          <p className="event__venue">{listing.venueName}</p>
          <p className="event__blurb">{listing.blurb}</p>
        </div>
      </section>

      <div className="event__grid">
        <ChartSheet>
          <h2 className="sheet__title">{listing.kind === 'movie' ? 'Choose a show' : 'Match'}</h2>
          <table className="chart chart--sessions">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Time</th>
                <th scope="col" className="chart__fare">Fares</th>
                <th scope="col"><span className="visually-hidden">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="chart__row">
                  <td>{formatDate(s.startsAt)}</td>
                  <td>{formatTime(s.startsAt)}</td>
                  <td className="chart__fare">
                    {formatMoney(Math.min(...cats.map((c) => c.priceMinor)), 'INR')}–{formatMoney(Math.max(...cats.map((c) => c.priceMinor)), 'INR')}
                  </td>
                  <td className="chart__go">
                    <Link to={`/book/${s.id}`} className="btn btn--seat">Choose seats</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="sheet__title">Fares by seat</h2>
          <dl className="fares">
            {cats.map((c) => (
              <div key={c.id} className="fares__row">
                <dt>{c.label}</dt>
                <dd>{formatMoney(c.priceMinor, 'INR')}</dd>
              </div>
            ))}
          </dl>
        </ChartSheet>

        <div className="event__preview">
          <h2 className="section-title section-title--small">From one seat here</h2>
          <PreviewPanel venue={listing.venue} />
          <p className="event__note">
            Open the seat map to check any other seat the same way: {preview.label} is just one of them.
          </p>
        </div>
      </div>
    </div>
  );
}
