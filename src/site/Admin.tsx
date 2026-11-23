import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CITIES, DEMO_MODEL_ID, type Auditorium, type Cinema } from '../discovery/directory';
import { api, ApiError, connectionText, fmtStamp, retryConnection, useAccount } from './platform';
import { Link } from './router';

interface Feed { cityId: string; cityName: string; lastSuccessAt: string | null; lastAttemptAt: string | null; lastError: string | null; liveShows: number; mappedCinemas: number }
interface Overview {
  providerConfigured: string | null;
  feeds: Feed[];
  cinemas: (Cinema & { feedRef: string | null })[];
  auditoriums: Auditorium[];
  runs: { id: string; cityId: string; status: string; message: string; shows: number; actorEmail: string | null; at: string }[];
  audit: { id: string; actorEmail: string; action: string; entity: string; entityId: string; after: unknown; at: string }[];
}

function advice(f: Feed, provider: string | null) {
  if (!provider) return 'Showing the directory. Add licensed provider credentials on the server to enable live times.';
  if (!f.mappedCinemas) return 'Add a provider cinema ID under Cinemas, then retry.';
  if (f.lastError) return 'Cached times stay visible. Check provider status and credentials, then retry.';
  return f.lastSuccessAt ? 'Healthy.' : 'Not imported yet. Run a refresh.';
}

export function Admin() {
  const { status, user, problem } = useAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [city, setCity] = useState('chennai');

  const load = useCallback(() => api<Overview>('/api/admin/overview').then(setData).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { if (user?.role === 'admin') void load(); }, [user?.role, load]);

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label); setError(null); setNotice(null);
    try { await fn(); setNotice(done); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'That change failed.'); }
    finally { setBusy(null); }
  };

  if (status === 'loading') return <div className="dx"><p className="dx-feed" role="status">Loading…</p></div>;
  if (status === 'frontend-only') return <div className="dx"><h1 className="dx-title">Admin</h1><p className="dx-note">Admin tools need the SeatView server, which this version doesn’t include.</p></div>;
  if (status === 'unavailable') {
    return <div className="dx"><h1 className="dx-title">Admin</h1><p className="dx-feed dx-feed--warn" role="status">{connectionText(problem)} <button type="button" className="dx-link" onClick={retryConnection}>Try again</button></p></div>;
  }
  if (user?.role !== 'admin') {
    return <div className="dx"><h1 className="dx-title">Admin</h1><p className="dx-note">{user ? 'Your account doesn’t have admin access.' : 'Sign in with an admin account.'} <Link to="/profile">Go to Profile</Link></p></div>;
  }
  if (!data) return <div className="dx"><h1 className="dx-title">Admin</h1><p className={error ? 'dx-error' : 'dx-feed'} role="status">{error ?? 'Loading…'}</p></div>;
  const cinemas = data.cinemas.filter((c) => c.cityId === city);

  return (
    <div className="dx dx--admin">
      <h1 className="dx-title">Admin</h1>
      <p className="dx-feed">Showtime provider: {data.providerConfigured ?? 'none configured'}</p>
      <div aria-live="polite">{notice && <p className="dx-ok">{notice}</p>}{error && <p className="dx-error">{error}</p>}</div>

      <section aria-labelledby="ad-feed">
        <h2 id="ad-feed" className="dx-h">Feed freshness</h2>
        <div className="ad-feeds">
          {data.feeds.map((f) => (
            <article key={f.cityId} className={f.lastError ? 'ad-feed is-bad' : 'ad-feed'} data-city={f.cityId}>
              <h3>{f.cityName}</h3>
              <p>Last success: {f.lastSuccessAt ? fmtStamp(f.lastSuccessAt) : 'never'}</p>
              <p>{f.liveShows} live shows · {f.mappedCinemas} mapped cinemas</p>
              {f.lastError && <p className="dx-error">Failed: {f.lastError}</p>}
              <p className="dx-note">{advice(f, data.providerConfigured)}</p>
              <button type="button" className="dx-btn" disabled={!!busy} onClick={() => void run(`r-${f.cityId}`, async () => {
                const r = await api<{ status: string; message: string }>(`/api/admin/refresh/${f.cityId}`, { method: 'POST' });
                setNotice(r.message);
              }, `${f.cityName}: refresh finished.`)}>{busy === `r-${f.cityId}` ? 'Refreshing…' : f.lastError ? 'Retry import' : 'Run refresh'}</button>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="ad-cin">
        <h2 id="ad-cin" className="dx-h">Cinemas and auditoriums</h2>
        <label className="ad-city">City <select value={city} onChange={(e) => setCity(e.target.value)}>{CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {cinemas.map((c) => <CinemaEditor key={c.id} cinema={c} others={cinemas.filter((x) => x.id !== c.id && !x.isDemo)} auditoriums={data.auditoriums.filter((a) => a.cinemaId === c.id)} hasProvider={!!data.providerConfigured} run={run} />)}
      </section>

      <section aria-labelledby="ad-log">
        <h2 id="ad-log" className="dx-h">Change history</h2>
        {data.audit.length === 0 && <p className="dx-note">No admin changes yet.</p>}
        <ul className="ad-log">
          {data.audit.map((a) => <li key={a.id}><time>{fmtStamp(a.at)}</time> <b>{a.actorEmail}</b> {a.action} {a.entity} <code>{a.entityId}</code></li>)}
        </ul>
        <h3 className="dx-h">Recent imports</h3>
        <ul className="ad-log">
          {data.runs.map((r) => <li key={r.id}><time>{fmtStamp(r.at)}</time> <b>{r.cityId}</b> {r.status}: {r.message}{r.actorEmail ? ` (${r.actorEmail})` : ''}</li>)}
        </ul>
      </section>
    </div>
  );
}

function CinemaEditor({ cinema, others, auditoriums, hasProvider, run }: { cinema: Cinema & { feedRef: string | null }; others: Cinema[]; auditoriums: Auditorium[]; hasProvider: boolean; run: (l: string, f: () => Promise<unknown>, d: string) => Promise<void> }) {
  const [name, setName] = useState(cinema.name);
  const [neighbourhood, setHood] = useState(cinema.neighbourhood);
  const [mall, setMall] = useState(cinema.mall ?? '');
  const [url, setUrl] = useState(cinema.providerUrl ?? '');
  const [alias, setAlias] = useState('');
  const [into, setInto] = useState('');
  const [feedRef, setRef] = useState(cinema.feedRef ?? '');
  const [audName, setAudName] = useState('');
  const [verification, setVerification] = useState<'' | 'verified' | 'illustrative'>('');
  const [note, setNote] = useState('');

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run('save', () => api(`/api/admin/cinemas/${cinema.id}`, { method: 'PATCH', body: { name, neighbourhood, mall: mall || null, providerUrl: url || null } }), `${name} saved. This correction survives refreshes.`);
  };
  const mapAud = (e: FormEvent) => {
    e.preventDefault();
    const slug = audName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    void run('aud', () => api(`/api/admin/auditoriums/${cinema.id}-${slug}`, { method: 'PUT', body: { cinemaId: cinema.id, name: audName, modelId: verification ? DEMO_MODEL_ID : null, verification: verification || null, note: note || null } }), `${audName} mapped.`).then(() => { setAudName(''); setNote(''); });
  };

  return (
    <details className="ad-cinema" data-cinema={cinema.id}>
      <summary><b>{cinema.name}</b> <span>{cinema.neighbourhood}</span>{cinema.isDemo && <span className="dx-tag dx-tag--demo">Demo</span>}</summary>
      <form className="dx-form ad-grid" onSubmit={save}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Neighbourhood<input value={neighbourhood} onChange={(e) => setHood(e.target.value)} required /></label>
        <label>Mall<input value={mall} onChange={(e) => setMall(e.target.value)} /></label>
        <label>Provider link<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <button className="dx-btn dx-btn--ink">Save correction</button>
      </form>
      <div className="ad-sub">
        <h4>Aliases</h4>
        <div className="dx-alts">
          {cinema.aliases.map((a) => (
            <button key={a} type="button" className="dx-chip" aria-label={`Remove alias ${a}`} onClick={() => void run('alias', () => api(`/api/admin/cinemas/${cinema.id}/aliases/remove`, { method: 'POST', body: { alias: a } }), `Removed “${a}”.`)}>{a} ×</button>
          ))}
        </div>
        <form className="ad-inline" onSubmit={(e) => { e.preventDefault(); void run('alias', () => api(`/api/admin/cinemas/${cinema.id}/aliases`, { method: 'POST', body: { alias } }), `Added “${alias}”.`).then(() => setAlias('')); }}>
          <label className="visually-hidden" htmlFor={`al-${cinema.id}`}>New alias</label>
          <input id={`al-${cinema.id}`} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="New alias" required />
          <button className="dx-btn">Add</button>
        </form>
      </div>
      {!cinema.isDemo && (
        <div className="ad-sub">
          <h4>Duplicate venue</h4>
          <form className="ad-inline" onSubmit={(e) => {
            e.preventDefault();
            const target = others.find((o) => o.id === into);
            if (target && window.confirm(`Merge ${cinema.name} into ${target.name}? Its favourites, aliases and shows move across.`)) void run('merge', () => api(`/api/admin/cinemas/${cinema.id}/merge`, { method: 'POST', body: { intoId: into } }), `Merged into ${target.name}.`);
          }}>
            <label className="visually-hidden" htmlFor={`mg-${cinema.id}`}>Merge into</label>
            <select id={`mg-${cinema.id}`} value={into} onChange={(e) => setInto(e.target.value)} required>
              <option value="">Merge into…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}, {o.neighbourhood}</option>)}
            </select>
            <button className="dx-btn">Merge</button>
          </form>
        </div>
      )}
      {hasProvider && !cinema.isDemo && (
        <div className="ad-sub">
          <h4>Provider cinema ID</h4>
          <form className="ad-inline" onSubmit={(e) => { e.preventDefault(); void run('ref', () => api(`/api/admin/cinemas/${cinema.id}/feed-ref`, { method: 'PUT', body: { externalId: feedRef } }), 'Provider ID saved.'); }}>
            <input aria-label="Provider cinema ID" value={feedRef} onChange={(e) => setRef(e.target.value)} required />
            <button className="dx-btn">Save</button>
          </form>
        </div>
      )}
      <div className="ad-sub">
        <h4>Auditoriums</h4>
        <ul className="ad-log">
          {auditoriums.map((a) => <li key={a.id}><b>{a.name}</b> {a.verification ?? 'no model'}{a.note ? `: ${a.note}` : ''}</li>)}
        </ul>
        <form className="dx-form ad-grid" onSubmit={mapAud}>
          <label>Auditorium name<input value={audName} onChange={(e) => setAudName(e.target.value)} placeholder="Screen 5" required /></label>
          <label>3D model
            <select value={verification} onChange={(e) => setVerification(e.target.value as typeof verification)}>
              <option value="">No model</option>
              <option value="illustrative">Scope 14 m: illustrative</option>
              <option value="verified">Scope 14 m: verified measurements</option>
            </select>
          </label>
          <label>Source or note{verification === 'verified' ? ' (required)' : ''}<input value={note} onChange={(e) => setNote(e.target.value)} required={verification === 'verified'} /></label>
          <button className="dx-btn">Map auditorium</button>
        </form>
      </div>
    </details>
  );
}
