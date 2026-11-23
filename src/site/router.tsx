import { useEffect, useReducer, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/** Minimal History-API router (no dependency): navigate(), useLocation(), <Link>. */
const listeners = new Set<() => void>();

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  listeners.forEach((l) => l());
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => listeners.forEach((l) => l()));
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
