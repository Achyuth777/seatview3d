import { useEffect, useState, type FormEvent } from 'react';
import { CITIES, type Screening } from '../discovery/directory';
import { Profile } from './Profile';
import { ForgotPassword } from './AuthPages';
import { api, connectionText, useAlerts, fmtDay, fmtTime, reloadLibrary, retryConnection, setAccount, toggleFavourite, toggleSaved, useAccount, useLibrary, type SavedItem, type User } from './platform';
import { useProfile } from './profileStore';
import { Link } from './router';
import { External } from './showParts';

const LANGUAGES = ['Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English'];

export function Account() {
  const { status, user, problem } = useAccount();
  return (
    <div className="dx dx--account">
      <h1 className="dx-title">Profile</h1>
      {user && <p className="dx-note">Signed in as {user.name}</p>}
      {status === 'loading' && <p className="dx-feed" role="status">Loading…</p>}
      {status === 'frontend-only' && <p className="dx-feed" data-connection="frontend-only">This version runs without a SeatView server, so sign-in and saving across devices are off. You can still browse, and demo tickets stay on this device.</p>}
      {status === 'unavailable' && (
        <p className="dx-feed dx-feed--warn" role="status" data-connection="unavailable">
          {connectionText(problem)} Sign-in is temporarily unavailable. Tickets saved on this device are still listed.{' '}
          <button type="button" className="dx-link" onClick={retryConnection}>Try again</button>
        </p>
      )}
      {status === 'guest' && <AuthForms />}
      {user && !user.emailVerified && <VerifyBanner email={user.email} />}
      {user && <SignedIn user={user} />}
      <section aria-labelledby="ax-demo">
        <h2 id="ax-demo" className="dx-h">Demo tickets <span className="dx-tag dx-tag--demo">No payment</span></h2>
        <p className="dx-note">Practice bookings for the sample schedule. They aren’t valid at any cinema.</p>
        <Profile embedded />
      </section>
    </div>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  return (
    <p className="dx-feed dx-feed--warn" role="status" data-verify="pending">
      Confirm your email to save cinemas and shows. We sent a link to {email}.{' '}
      {sent ? 'A new link is on its way.' : <button type="button" className="dx-link" onClick={() => void api('/api/auth/resend-verification', { method: 'POST' }).then(() => setSent(true))}>Send a new link</button>}
    </p>
  );
}

function AuthForms() {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'forgot') return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>(mode === 'in' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: mode === 'in' ? { email, password } : { email, password, name } });
      setAccount(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (mode === 'forgot') return <ForgotPassword onBack={() => setMode('in')} />;
  return (
    <form className="dx-form" onSubmit={submit}>
      <h2 className="dx-h">{mode === 'in' ? 'Sign in' : 'Create an account'}</h2>
      <p className="dx-note">Keep favourite cinemas and saved shows across devices. Browsing never needs an account.</p>
      {mode === 'up' && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required /></label>}
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={mode === 'up' ? 10 : undefined} maxLength={200} required /></label>
      {error && <p className="dx-error" role="alert">{error}</p>}
      <div className="dx-actions">
        <button className="dx-btn dx-btn--ink" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="dx-link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null); }}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
        {mode === 'in' && <button type="button" className="dx-link" onClick={() => setMode('forgot')}>Forgot password?</button>}
      </div>
    </form>
  );
}

function SignedIn({ user }: { user: User }) {
  const lib = useLibrary();
  const loaded = !!lib;
  useEffect(() => {
    if (loaded && window.location.hash === '#saved') document.getElementById('saved')?.scrollIntoView();
  }, [loaded]);
  return (
    <>
      <ImportLocal user={user} already={lib?.demoTickets ?? []} />
      <Updates />
      <section id="saved" aria-labelledby="ax-saved">
        <h2 id="ax-saved" className="dx-h">Saved shows</h2>
        <p className="dx-note">Shows you’re considering. Saving isn’t a booking, and opening a provider’s site doesn’t confirm a purchase.</p>
        {lib?.saved.length === 0 && <p className="dx-note">Tap the star next to any showtime to keep it here. <Link to="/movies">Find a show</Link></p>}
        {lib?.saved.map((s) => <SavedRow key={s.screeningId} item={s} />)}
      </section>
      <section aria-labelledby="ax-fav">
        <h2 id="ax-fav" className="dx-h">Favourite cinemas</h2>
        {lib?.favourites.length === 0 && <p className="dx-note">Tap the star next to a cinema to keep it at the top of your city.</p>}
        <ul className="dx-list">
          {lib?.favourites.map((c) => (
            <li key={c.id} className="dx-cinema dx-cinema--row">
              <div className="dx-cinema__head"><div><h3><Link to={`/cinema/${c.id}`}>{c.name}</Link></h3><p>{c.neighbourhood}{c.mall ? ` · ${c.mall}` : ''}</p></div></div>
              <button type="button" className="dx-link" onClick={() => void toggleFavourite(c.id, false)} aria-label={`Remove ${c.name} from favourites`}>Remove</button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ax-conf">
        <h2 id="ax-conf" className="dx-h">Confirmed bookings</h2>
        <p className="dx-note">None. SeatView can’t see purchases made on a provider’s site, so your provider’s confirmation is your ticket.</p>
      </section>
      <Preferences user={user} />
    </>
  );
}

const when = (s: Screening) => `${fmtDay(s.localDate)}, ${fmtTime(s.startsAt)}`;

function SavedRow({ item }: { item: SavedItem }) {
  const show = item.current ?? item.saved;
  const act = async (fn: () => Promise<unknown>) => { await fn(); await reloadLibrary(); };
  const label = { upcoming: null, changed: 'Changed', removed: 'No longer listed', past: 'Show has ended' }[item.state];
  return (
    <article className={`dx-savedrow dx-savedrow--${item.state}`} data-state={item.state}>
      <div className="dx-savedrow__main">
        <h3>{item.filmTitle} {show.isDemo && <span className="dx-tag dx-tag--demo">Demo</span>}</h3>
        <p>{item.cinemaName} · {when(show)} · {show.language ?? 'Language not listed'} · {show.format}</p>
        {label && <p className="dx-update" role="status"><b>{label}.</b> {item.changes.join('. ')}</p>}
        {item.alternatives.length > 0 && (
          <div className="dx-alts">
            <span>Other shows here:</span>
            {item.alternatives.map((a) => a.isDemo
              ? <Link key={a.id} to={`/book/${a.id}`} className="dx-chip">{when(a)}</Link>
              : <button key={a.id} type="button" className="dx-chip" onClick={() => void toggleSaved(a.id, true)}>Save {when(a)}</button>)}
          </div>
        )}
        {item.canRate && (
          <div className="dx-rate" role="group" aria-label="Rate your seat view">
            <span>How was the seat view?</span>
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className="dx-chip" aria-label={`${n} of 5`} onClick={() => void act(() => api(`/api/me/saved/${item.screeningId}/rating`, { method: 'POST', body: { score: n } }))}>{n}</button>)}
            <button type="button" className="dx-link" onClick={() => void act(() => api(`/api/me/saved/${item.screeningId}/dismiss-rating`, { method: 'POST' }))}>Not now</button>
          </div>
        )}
        {item.rating !== null && <p className="dx-note">You rated this seat view {item.rating} of 5.</p>}
      </div>
      <div className="dx-actions">
        {show.isDemo && item.state !== 'past' && item.state !== 'removed' && <Link className="dx-btn" to={`/book/${show.id}`}>Open</Link>}
        {!show.isDemo && show.providerUrl && item.state !== 'past' && item.state !== 'removed' && <External href={show.providerUrl}>Open</External>}
        {item.state === 'changed' && <button type="button" className="dx-link" onClick={() => void act(() => api(`/api/me/saved/${item.screeningId}/acknowledge`, { method: 'POST' }))}>Got it</button>}
        <button type="button" className="dx-link" onClick={() => void toggleSaved(item.screeningId, false)} aria-label={`Remove saved show ${item.filmTitle}`}>Remove</button>
      </div>
    </article>
  );
}

function ImportLocal({ user, already }: { user: User; already: string[] }) {
  const local = useProfile();
  const [results, setResults] = useState<{ reference: string; result: string }[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pending = local.bookings.filter((b) => !already.includes(b.reference));
  useEffect(() => setDismissed(false), [user.id]);
  if (dismissed || (!pending.length && !results)) return null;
  const TEXT: Record<string, string> = {
    added: 'added', 'already-added': 'already in your account',
    'not-verified': 'not added: its email doesn’t match this account', 'other-account': 'not added: it belongs to another account',
  };
  return (
    <section className="dx-import" aria-label="Import from this browser">
      {results ? (
        <ul>{results.map((r) => <li key={r.reference}>{r.reference}: {TEXT[r.result]}</li>)}</ul>
      ) : (
        <p>{pending.length} demo {pending.length === 1 ? 'ticket' : 'tickets'} saved in this browser. Add {pending.length === 1 ? 'it' : 'them'} to your account? Only tickets booked with {user.email} can be added.</p>
      )}
      <div className="dx-actions">
        {!results && (
          <button type="button" className="dx-btn dx-btn--ink" onClick={() => void api<{ results: { reference: string; result: string }[] }>('/api/me/import', { method: 'POST', body: { tickets: pending.map((b) => ({ reference: b.reference, email: b.email })) } }).then((r) => { setResults(r.results); return reloadLibrary(); })}>
            Import tickets
          </button>
        )}
        <button type="button" className="dx-link" onClick={() => setDismissed(true)}>{results ? 'Close' : 'Not now'}</button>
      </div>
    </section>
  );
}

function Preferences({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const [homeCity, setHome] = useState(user.homeCity ?? '');
  const [languages, setLangs] = useState(user.languages);
  const [notify, setNotify] = useState(user.notify);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ user: User }>('/api/me', { method: 'PATCH', body: { name, homeCity: homeCity || null, languages, notify } });
      setAccount(r.user);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };
  const [emailDelivery, setDelivery] = useState('none');
  useEffect(() => { api<{ emailDelivery: string }>('/api/config').then((c) => setDelivery(c.emailDelivery)).catch(() => undefined); }, []);
  const signOut = async () => { await api('/api/auth/logout', { method: 'POST' }); setAccount(null); };
  return (
    <section aria-labelledby="ax-pref">
      <h2 id="ax-pref" className="dx-h">Details and preferences</h2>
      <form className="dx-form" onSubmit={save}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></label>
        <label>Home city
          <select value={homeCity} onChange={(e) => setHome(e.target.value)}>
            <option value="">Not set</option>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <fieldset><legend>Preferred languages</legend>
          {LANGUAGES.map((l) => (
            <label key={l} className="dx-check"><input type="checkbox" checked={languages.includes(l)} onChange={(e) => setLangs(e.target.checked ? [...languages, l] : languages.filter((x) => x !== l))} />{l}</label>
          ))}
        </fieldset>
        <fieldset><legend>Notifications</legend>
          <label className="dx-check"><input type="checkbox" checked={notify.showChanges} onChange={(e) => setNotify({ ...notify, showChanges: e.target.checked })} />Show changes to saved shows on this page</label>
          <label className="dx-check"><input type="checkbox" checked={notify.emailReminders} disabled={emailDelivery !== 'smtp'} onChange={(e) => setNotify({ ...notify, emailReminders: e.target.checked })} />Email me reminders</label>
          {emailDelivery !== 'smtp' && <p className="dx-note">Email reminders aren’t available yet, because email sending isn’t connected. Changes to saved shows always appear here.</p>}
        </fieldset>
        {msg && <p className={msg.ok ? 'dx-ok' : 'dx-error'} role="status">{msg.text}</p>}
        <div className="dx-actions">
          <button className="dx-btn dx-btn--ink">Save</button>
          {user.role === 'admin' && <Link className="dx-btn" to="/admin">Admin</Link>}
          <button type="button" className="dx-link" onClick={() => void signOut()}>Sign out</button>
        </div>
      </form>
    </section>
  );
}

/** Changes to saved shows. Each arrives once from the server and stays visible for this browser session. */
function Updates() {
  const alerts = useAlerts();
  if (!alerts.length) return null;
  const when = (local: string) => `${fmtDay(local.slice(0, 10))}, ${fmtTime(local)}`;
  return (
    <section aria-labelledby="ax-updates" className="dx-updates">
      <h2 id="ax-updates" className="dx-h">Updates to saved shows</h2>
      <ul className="dx-list">
        {alerts.map((a) => (
          <li key={a.id} className="dx-alert" data-alert={a.kind}>
            <b>{a.filmTitle}</b> at {a.cinemaName}:{' '}
            {a.kind === 'changed' && a.newStart
              ? <>moved from <s>{when(a.oldStart)}</s> to <strong>{when(a.newStart)}</strong>.</>
              : <>the {when(a.oldStart)} show is no longer listed by the provider.</>}{' '}
            <Link to={`/cinema/${a.cinemaId}`}>See other shows here</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
