import { useEffect, useState, type FormEvent } from 'react';
import { api, setAccount, type User } from './platform';
import { Link, navigate, useLocation } from './router';

/** /verify-email?token=… from the confirmation email. */
export function VerifyEmail() {
  const { query } = useLocation();
  const token = query.get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');
  useEffect(() => {
    api<{ user: User }>('/api/auth/verify', { method: 'POST', body: { token } })
      .then(() => { setState('done'); return api<{ user: User | null }>('/api/me').then((r) => setAccount(r.user)); })
      .catch((e: Error) => { setState('failed'); setMessage(e.message); });
  }, [token]);
  return (
    <div className="dx dx--narrow">
      <h1 className="dx-title">Confirm your email</h1>
      {state === 'working' && <p className="dx-feed" role="status">Checking your link…</p>}
      {state === 'done' && <p className="dx-ok" role="status">Your email is confirmed. You can now save cinemas and shows.</p>}
      {state === 'failed' && <p className="dx-error" role="alert">{message}</p>}
      <Link className="dx-btn" to="/profile">Go to Profile</Link>
    </div>
  );
}

/** /reset-password?token=… from the reset email. */
export function ResetPassword() {
  const { query } = useLocation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/auth/reset', { method: 'POST', body: { token: query.get('token') ?? '', password } });
      setAccount(null);
      setDone(true);
    } catch (err) { setError((err as Error).message); }
  };
  return (
    <div className="dx dx--narrow">
      <h1 className="dx-title">Choose a new password</h1>
      {done ? (
        <>
          <p className="dx-ok" role="status">Password changed. You’ve been signed out everywhere, so sign in with the new password.</p>
          <button type="button" className="dx-btn" onClick={() => navigate('/profile')}>Sign in</button>
        </>
      ) : (
        <form className="dx-form" onSubmit={submit}>
          <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} maxLength={200} required /></label>
          <p className="dx-note">At least 10 characters.</p>
          {error && <p className="dx-error" role="alert">{error}</p>}
          <button className="dx-btn dx-btn--ink">Save new password</button>
        </form>
      )}
    </div>
  );
}

/** Asks for a reset link. The answer is the same whether or not the account exists. */
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('/api/auth/forgot', { method: 'POST', body: { email } }); setSent(true); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <form className="dx-form" onSubmit={submit}>
      <h2 className="dx-h">Reset your password</h2>
      {sent ? (
        <p className="dx-ok" role="status">If an account uses {email}, a reset link is on its way. It expires in an hour.</p>
      ) : (
        <>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required /></label>
          {error && <p className="dx-error" role="alert">{error}</p>}
          <button className="dx-btn dx-btn--ink">Send reset link</button>
        </>
      )}
      <button type="button" className="dx-link" onClick={onBack}>Back to sign in</button>
    </form>
  );
}
