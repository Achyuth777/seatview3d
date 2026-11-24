import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CITIES, DEMO_MODEL_ID, type Auditorium, type Cinema } from '../discovery/directory';

/** The admin app is its own entry point (admin.html). Every permission is enforced by the server. */
class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, { method: init.method ?? 'GET', credentials: 'same-origin', headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null) as { code?: string; message?: string } | null;
  if (!res.ok) throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? `Request failed (${res.status})`);
  if (data === null) throw new ApiError(res.status, 'BAD_RESPONSE', 'The server sent an unexpected response.');
  return data as T;
}
const STAMP = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const stamp = (iso: string | null) => (iso ? `${STAMP.format(new Date(iso))} IST` : 'never');

interface Session { email: string; name: string; mfa: { required: boolean; enrolled: boolean; verified: boolean } }
type Gate = { state: 'loading' } | { state: 'signin' } | { state: 'denied' } | { state: 'mfa'; enrolled: boolean } | { state: 'ready'; session: Session } | { state: 'offline'; message: string };

export function AdminApp() {
  const [gate, setGate] = useState<Gate>({ state: 'loading' });
  const check = useCallback(async () => {
    try {
      const s = await api<Session>('/api/admin/session');
      setGate(s.mfa.required && !s.mfa.verified ? { state: 'mfa', enrolled: s.mfa.enrolled } : { state: 'ready', session: s });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setGate({ state: 'signin' });
      else if (e instanceof ApiError && e.status === 403) setGate({ state: 'denied' });
      else setGate({ state: 'offline', message: 'Can’t reach the SeatView server.' });
    }
  }, []);
  useEffect(() => { void check(); }, [check]);
  const signOut = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined); setGate({ state: 'signin' }); };

  if (gate.state === 'loading') return <Frame><p className="dx-feed" role="status">Checking access…</p></Frame>;
  if (gate.state === 'offline') return <Frame><p className="dx-feed dx-feed--warn" role="status">{gate.message} <button type="button" className="dx-link" onClick={() => void check()}>Try again</button></p></Frame>;
  if (gate.state === 'signin') return <Frame><SignIn onDone={check} /></Frame>;
  if (gate.state === 'denied') return (
    <Frame>
      <h1 className="dx-title">No admin access</h1>
      <p className="dx-note">This account isn’t an admin. Ask the owner to grant access, then sign in again.</p>
      <button type="button" className="dx-btn" onClick={() => void signOut()}>Sign out</button>
    </Frame>
  );
  if (gate.state === 'mfa') return <Frame><Mfa enrolled={gate.enrolled} onDone={check} onSignOut={signOut} /></Frame>;
  return <Workspace session={gate.session} onAccessLost={check} onSignOut={signOut} />;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="ad-shell ad-shell--gate">
      <header className="ad-top"><span className="strip__mark">SV</span><span className="ad-top__name">SeatView Admin</span></header>
      <main className="ad-gate dx">{children}</main>
    </div>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try { await api('/api/auth/login', { method: 'POST', body: { email, password } }); onDone(); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <form className="dx-form" onSubmit={submit}>
      <h1 className="dx-title">Admin sign-in</h1>
      <p className="dx-note">Use your SeatView account. Access is checked on the server for every action.</p>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      {error && <p className="dx-error" role="alert">{error}</p>}
      <button className="dx-btn">Sign in</button>
    </form>
  );
}

function Mfa({ enrolled, onDone, onSignOut }: { enrolled: boolean; onDone: () => void; onSignOut: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = async () => { setError(null); try { setSetup(await api('/api/admin/mfa/enroll', { method: 'POST' })); } catch (e) { setError((e as Error).message); } };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try { await api('/api/admin/mfa/verify', { method: 'POST', body: { code } }); onDone(); } catch (err) { setError((err as Error).message); }
  };
  return (
    <div className="dx-form">
      <h1 className="dx-title">Two-step sign-in</h1>
      {!enrolled && !setup && (
        <>
          <p className="dx-note">Admins need a second step. Set it up once with an authenticator app.</p>
          <button type="button" className="dx-btn" onClick={() => void start()}>Set up two-step sign-in</button>
        </>
      )}
      {setup && (
        <div className="ad-secret">
          <p>Add this key to your authenticator app, or open the setup link on your phone.</p>
          <code data-totp-secret={setup.secret}>{setup.secret.match(/.{1,4}/g)!.join(' ')}</code>
          <a href={setup.uri}>Open setup link</a>
        </div>
      )}
      {(enrolled || setup) && (
        <form onSubmit={submit} className="dx-form">
          <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required /></label>
          <button className="dx-btn">Verify</button>
        </form>
      )}
      {error && <p className="dx-error" role="alert">{error}</p>}
      <button type="button" className="dx-link" onClick={onSignOut}>Sign out</button>
    </div>
  );
}

interface Feed { cityId: string; cityName: string; lastSuccessAt: string | null; lastAttemptAt: string | null; lastFailureAt: string | null; expiresAt: string | null; lastError: string | null; liveShows: number; mappedCinemas: number }
type AdminCinema = Cinema & { feedRef: string | null; linkSource: string | null; linkVerifiedAt: string | null };
interface Overview {
  providerConfigured: string | null;
  feeds: Feed[];
  cinemas: AdminCinema[];
  auditoriums: Auditorium[];
  verifications: { id: string; auditoriumId: string; status: string; source: string; measuredOn: string | null; by: string; at: string }[];
  runs: { id: string; cityId: string; status: string; message: string; shows: number; actorEmail: string | null; at: string }[];
  audit: { id: string; actorEmail: string; action: string; entity: string; entityId: string; after: unknown; at: string }[];
  mailFailures: { id: string; kind: string; error: string | null; attempts: number; at: string }[];
}
const SECTIONS = [['feeds', 'Feeds'], ['cinemas', 'Cinemas'], ['layouts', 'Layouts'], ['activity', 'Activity'], ['mail', 'Mail']] as const;
type Section = (typeof SECTIONS)[number][0];
/** `done` may read the result, so an import that failed is never reported as a success. */
type Run = (label: string, fn: () => Promise<unknown>, done: string | ((result: unknown) => { ok: boolean; text: string })) => Promise<void>;

function Workspace({ session, onAccessLost, onSignOut }: { session: Session; onAccessLost: () => void; onSignOut: () => void }) {
  const [section, setSection] = useState<Section>(() => (SECTIONS.find(([k]) => `#${k}` === window.location.hash)?.[0] ?? 'feeds'));
  const [data, setData] = useState<Overview | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const handle = useCallback((e: unknown) => {
    // Losing the role or the session ends access at once: back to the gate.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { onAccessLost(); return; }
    setNotice({ ok: false, text: e instanceof ApiError ? e.message : 'That change failed.' });
  }, [onAccessLost]);
  const load = useCallback(() => api<Overview>('/api/admin/overview').then(setData).catch(handle), [handle]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const f = () => { const k = SECTIONS.find(([s]) => `#${s}` === window.location.hash)?.[0]; if (k) setSection(k); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const run: Run = async (label, fn, done) => {
    setBusy(label); setNotice(null);
    try { const r = await fn(); setNotice(typeof done === 'string' ? { ok: true, text: done } : done(r)); await load(); } catch (e) { handle(e); } finally { setBusy(null); }
  };

  return (
    <div className="ad-shell">
      <header className="ad-top">
        <span className="strip__mark">SV</span><span className="ad-top__name">SeatView Admin</span>
        <span className="ad-top__who">{session.email}{session.mfa.verified ? ' · two-step verified' : ''}</span>
        <button type="button" className="dx-link" onClick={onSignOut}>Sign out</button>
      </header>
      <nav className="ad-nav" aria-label="Admin sections">
        {SECTIONS.map(([k, label]) => <a key={k} href={`#${k}`} aria-current={section === k ? 'page' : undefined} onClick={() => setSection(k)}>{label}</a>)}
        <a href="/" className="ad-nav__site">Open site</a>
      </nav>
      <main className="ad-main dx" id="main">
        <div aria-live="polite">{notice && <p className={notice.ok ? 'dx-ok' : 'dx-error'}>{notice.text}</p>}</div>
        {!data ? <p className="dx-feed" role="status">Loading…</p> : (
          <>
            {section === 'feeds' && <Feeds data={data} busy={busy} run={run} />}
            {section === 'cinemas' && <Cinemas data={data} run={run} />}
            {section === 'layouts' && <Layouts data={data} run={run} />}
            {section === 'activity' && <Activity data={data} />}
            {section === 'mail' && <Mail data={data} />}
          </>
        )}
      </main>
    </div>
  );
}

function advice(f: Feed, provider: string | null) {
  if (!provider) return 'Showing the directory only. Live times need a licensed provider configured on the server.';
  if (!f.mappedCinemas) return 'Add a provider cinema ID under Cinemas, then retry.';
  if (f.lastError) return 'Visitors still see the last good times, with their age. Check the provider’s status and credentials, then retry.';
  return f.lastSuccessAt ? 'Healthy.' : 'Not imported yet. Run an import.';
}

function Feeds({ data, busy, run }: { data: Overview; busy: string | null; run: Run }) {
  return (
    <section aria-labelledby="ad-feeds">
      <h1 id="ad-feeds" className="dx-title">Feed freshness</h1>
      <p className="dx-feed">Showtime provider: {data.providerConfigured ?? 'none configured'}{data.providerConfigured === 'fixture' ? ' (simulated test feed)' : ''}</p>
      <div className="ad-feeds">
        {data.feeds.map((f) => (
          <article key={f.cityId} className={f.lastError ? 'ad-feed is-bad' : 'ad-feed'} data-city={f.cityId}>
            <h2>{f.cityName}</h2>
            <dl className="ad-facts">
              <div><dt>Last successful sync</dt><dd data-k="success">{stamp(f.lastSuccessAt)}</dd></div>
              <div><dt>Latest failed attempt</dt><dd data-k="failure">{f.lastFailureAt ? stamp(f.lastFailureAt) : 'none'}</dd></div>
              <div><dt>Cache expires</dt><dd>{stamp(f.expiresAt)}</dd></div>
              <div><dt>Live shows · mapped cinemas</dt><dd>{f.liveShows} · {f.mappedCinemas}</dd></div>
            </dl>
            {f.lastError && <p className="dx-error">Failed: {f.lastError}</p>}
            <p className="dx-note">{advice(f, data.providerConfigured)}</p>
            <button type="button" className="dx-btn" disabled={!!busy} onClick={() => void run(`r-${f.cityId}`,
              () => api<{ message: string; status: string }>(`/api/admin/refresh/${f.cityId}`, { method: 'POST' }),
              (r) => { const res = r as { message: string; status: string }; return { ok: res.status !== 'failed', text: `${f.cityName}: ${res.message}` }; })}>{busy === `r-${f.cityId}` ? 'Importing…' : f.lastError ? 'Retry failed sync' : 'Run import'}</button>
          </article>
        ))}
      </div>
      <h2 className="dx-h">Recent imports</h2>
      <ul className="ad-log">{data.runs.map((r) => <li key={r.id}><time>{stamp(r.at)}</time> <b>{r.cityId}</b> {r.status}: {r.message}{r.actorEmail ? ` (${r.actorEmail})` : ''}</li>)}</ul>
    </section>
  );
}

function Cinemas({ data, run }: { data: Overview; run: Run }) {
  const [city, setCity] = useState('chennai');
  const list = data.cinemas.filter((c) => c.cityId === city);
  return (
    <section aria-labelledby="ad-cinemas">
      <h1 id="ad-cinemas" className="dx-title">Cinemas</h1>
      <label className="ad-city">City <select value={city} onChange={(e) => setCity(e.target.value)}>{CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {list.map((c) => <CinemaEditor key={c.id} cinema={c} others={list.filter((x) => x.id !== c.id && !x.isDemo)} hasProvider={!!data.providerConfigured} run={run} />)}
    </section>
  );
}

function CinemaEditor({ cinema, others, hasProvider, run }: { cinema: AdminCinema; others: Cinema[]; hasProvider: boolean; run: Run }) {
  const [name, setName] = useState(cinema.name);
  const [neighbourhood, setHood] = useState(cinema.neighbourhood);
  const [mall, setMall] = useState(cinema.mall ?? '');
  const [url, setUrl] = useState(cinema.providerUrl ?? '');
  const [alias, setAlias] = useState('');
  const [into, setInto] = useState('');
  const [feedRef, setRef] = useState(cinema.feedRef ?? '');
  return (
    <details className="ad-cinema" data-cinema={cinema.id}>
      <summary><b>{cinema.name}</b> <span>{cinema.neighbourhood}</span>{cinema.isDemo && <span className="dx-tag dx-tag--demo">Demo</span>}</summary>
      <form className="dx-form ad-grid" aria-label={`Correct ${cinema.name}`} onSubmit={(e) => { e.preventDefault(); void run('save', () => api(`/api/admin/cinemas/${cinema.id}`, { method: 'PATCH', body: { name, neighbourhood, mall: mall || null } }), `${name} saved. This correction survives imports and directory syncs.`); }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Neighbourhood<input value={neighbourhood} onChange={(e) => setHood(e.target.value)} required /></label>
        <label>Mall<input value={mall} onChange={(e) => setMall(e.target.value)} /></label>
        <button className="dx-btn dx-btn--ink">Save correction</button>
      </form>
      {!cinema.isDemo && (
        <form className="ad-sub ad-inline" aria-label={`Provider link for ${cinema.name}`} onSubmit={(e) => { e.preventDefault(); void run('link', () => api(`/api/admin/cinemas/${cinema.id}/provider-link`, { method: 'PUT', body: { url: url || null } }), 'Provider link saved.'); }}>
          <h3>Provider link <span className="ad-meta">{cinema.linkSource === 'admin' ? 'set by an admin' : 'from the directory'}{cinema.linkVerifiedAt ? `, checked ${stamp(cinema.linkVerifiedAt)}` : ''}</span></h3>
          <label className="visually-hidden" htmlFor={`url-${cinema.id}`}>Provider link</label>
          <input id={`url-${cinema.id}`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          <button className="dx-btn">Save link</button>
        </form>
      )}
      <div className="ad-sub">
        <h3>Search aliases</h3>
        <div className="dx-alts">{cinema.aliases.map((a) => <button key={a} type="button" className="dx-chip" aria-label={`Remove alias ${a}`} onClick={() => void run('alias', () => api(`/api/admin/cinemas/${cinema.id}/aliases/remove`, { method: 'POST', body: { alias: a } }), `Removed “${a}”.`)}>{a} ×</button>)}</div>
        <form className="ad-inline" onSubmit={(e) => { e.preventDefault(); void run('alias', () => api(`/api/admin/cinemas/${cinema.id}/aliases`, { method: 'POST', body: { alias } }), `Added “${alias}”.`).then(() => setAlias('')); }}>
          <label className="visually-hidden" htmlFor={`al-${cinema.id}`}>New alias</label>
          <input id={`al-${cinema.id}`} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="New alias" required />
          <button className="dx-btn">Add alias</button>
        </form>
      </div>
      {!cinema.isDemo && (
        <form className="ad-sub ad-inline" onSubmit={(e) => { e.preventDefault(); const t = others.find((o) => o.id === into); if (t && window.confirm(`Merge ${cinema.name} into ${t.name}? Favourites, aliases and shows move across.`)) void run('merge', () => api(`/api/admin/cinemas/${cinema.id}/merge`, { method: 'POST', body: { intoId: into } }), `Merged into ${t.name}.`); }}>
          <h3>Duplicate venue</h3>
          <label className="visually-hidden" htmlFor={`mg-${cinema.id}`}>Merge into</label>
          <select id={`mg-${cinema.id}`} value={into} onChange={(e) => setInto(e.target.value)} required><option value="">Merge into…</option>{others.map((o) => <option key={o.id} value={o.id}>{o.name}, {o.neighbourhood}</option>)}</select>
          <button className="dx-btn">Merge</button>
        </form>
      )}
      {hasProvider && !cinema.isDemo && (
        <form className="ad-sub ad-inline" onSubmit={(e) => { e.preventDefault(); void run('ref', () => api(`/api/admin/cinemas/${cinema.id}/feed-ref`, { method: 'PUT', body: { externalId: feedRef } }), 'Provider cinema ID saved.'); }}>
          <h3>Provider cinema ID</h3>
          <input aria-label={`Provider cinema ID for ${cinema.name}`} value={feedRef} onChange={(e) => setRef(e.target.value)} required />
          <button className="dx-btn">Save ID</button>
        </form>
      )}
    </details>
  );
}

function Layouts({ data, run }: { data: Overview; run: Run }) {
  const real = data.cinemas.filter((c) => !c.isDemo);
  const [cinemaId, setCinema] = useState(real[0]?.id ?? '');
  const [name, setName] = useState('');
  const [verification, setVerification] = useState<'' | 'illustrative' | 'verified'>('');
  const [note, setNote] = useState('');
  const [measuredOn, setMeasured] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    void run('aud', () => api(`/api/admin/auditoriums/${cinemaId}-${slug}`, { method: 'PUT', body: { cinemaId, name, modelId: verification ? DEMO_MODEL_ID : null, verification: verification || null, note: note || null, measuredOn: measuredOn || null } }), `${name} saved.`);
  };
  const cinemaName = (id: string) => data.cinemas.find((c) => c.id === id)?.name ?? id;
  return (
    <section aria-labelledby="ad-layouts">
      <h1 id="ad-layouts" className="dx-title">Auditorium layouts</h1>
      <p className="dx-note">“Verified layout” shows only for an auditorium with a measurement record. Without one, previews say “Illustrative”.</p>
      <table className="ad-table">
        <thead><tr><th scope="col">Auditorium</th><th scope="col">Cinema</th><th scope="col">Shown as</th></tr></thead>
        <tbody>{data.auditoriums.map((a) => <tr key={a.id} data-auditorium={a.id}><td>{a.name}</td><td>{cinemaName(a.cinemaId)}</td><td>{a.verification ?? 'No model'}</td></tr>)}</tbody>
      </table>
      <form className="dx-form ad-grid" onSubmit={submit} aria-label="Map or verify an auditorium">
        <label>Cinema<select value={cinemaId} onChange={(e) => setCinema(e.target.value)}>{real.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.neighbourhood}</option>)}</select></label>
        <label>Auditorium name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Screen 5" required /></label>
        <label>3D model<select value={verification} onChange={(e) => setVerification(e.target.value as typeof verification)}><option value="">No model</option><option value="illustrative">Scope 14 m: illustrative</option><option value="verified">Scope 14 m: verified measurements</option></select></label>
        <label>Measurement source{verification === 'verified' ? ' (required)' : ''}<input value={note} onChange={(e) => setNote(e.target.value)} required={verification === 'verified'} /></label>
        <label>Measured on<input type="date" value={measuredOn} onChange={(e) => setMeasured(e.target.value)} /></label>
        <button className="dx-btn dx-btn--ink">Save auditorium</button>
      </form>
      <h2 className="dx-h">Verification history</h2>
      {data.verifications.length === 0 && <p className="dx-note">No auditorium has been verified yet.</p>}
      <ul className="ad-log">{data.verifications.map((v) => <li key={v.id}><time>{stamp(v.at)}</time> <b>{v.by}</b> {v.status} <code>{v.auditoriumId}</code>: {v.source}{v.measuredOn ? ` (measured ${v.measuredOn})` : ''}</li>)}</ul>
    </section>
  );
}

function Activity({ data }: { data: Overview }) {
  return (
    <section aria-labelledby="ad-activity">
      <h1 id="ad-activity" className="dx-title">Audit log</h1>
      {data.audit.length === 0 && <p className="dx-note">No admin changes yet.</p>}
      <table className="ad-table">
        <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Record</th></tr></thead>
        <tbody>{data.audit.map((a) => <tr key={a.id} data-audit={a.action}><td>{stamp(a.at)}</td><td>{a.actorEmail}</td><td>{a.action} {a.entity}</td><td><code>{a.entityId}</code></td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Mail({ data }: { data: Overview }) {
  return (
    <section aria-labelledby="ad-mail">
      <h1 id="ad-mail" className="dx-title">Email delivery</h1>
      <p className="dx-note">Email is simulated: messages are recorded in the outbox and nothing is sent, because no email provider is connected. Connecting one needs a provider account and credentials on the server.</p>
      {data.mailFailures.length === 0 ? <p className="dx-feed">No failed deliveries.</p> : (
        <ul className="ad-log">{data.mailFailures.map((m) => <li key={m.id}><time>{stamp(m.at)}</time> {m.kind}: {m.error} ({m.attempts} attempts). Check the provider credentials, then resend from the user’s Profile.</li>)}</ul>
      )}
    </section>
  );
}
