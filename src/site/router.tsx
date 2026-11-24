import { useEffect, useReducer, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * Minimal History-API router (no dependency): navigate(), useLocation(), <Link>.
 * Each history entry remembers its scroll position and the last clicked element marked with
 * data-restore-key, so Back returns to the same place and the same cinema.
 */
const listeners = new Set<() => void>();
interface EntryState { scroll?: number; focus?: string }

const remember = (patch: EntryState) => window.history.replaceState({ ...(window.history.state ?? {}), ...patch }, '');

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState({ ...(window.history.state ?? {}), scroll: window.scrollY }, '', to);
  else {
    remember({ scroll: window.scrollY });
    window.history.pushState(null, '', to);
  }
  listeners.forEach((l) => l());
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
}

/** Waits for async content to reach the saved height and the saved element to exist, then restores both. */
function restore(state: EntryState | null) {
  if (!state) return;
  const { scroll = 0, focus } = state;
  const started = performance.now();
  const tick = () => {
    const el = focus ? document.querySelector<HTMLElement>(`[data-restore-key="${CSS.escape(focus)}"]`) : null;
    const tallEnough = document.documentElement.scrollHeight >= scroll + window.innerHeight - 4;
    if ((tallEnough && (!focus || el)) || performance.now() - started > 3000) {
      window.scrollTo({ top: scroll });
      el?.focus({ preventScroll: true });
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

if (typeof window !== 'undefined') {
  window.history.scrollRestoration = 'manual';
  window.addEventListener('popstate', (e) => {
    listeners.forEach((l) => l());
    restore(e.state as EntryState | null);
  });
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-restore-key]');
    if (el) remember({ focus: el.getAttribute('data-restore-key')!, scroll: window.scrollY });
  }, true);
}

export function useLocation(): { path: string; query: URLSearchParams } {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return { path: window.location.pathname, query: new URLSearchParams(window.location.search) };
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}

/** Matches "/event/:id" style patterns; returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i]!.startsWith(':')) params[p[i]!.slice(1)] = decodeURIComponent(s[i]!);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
