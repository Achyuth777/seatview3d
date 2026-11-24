import { useSyncExternalStore } from 'react';

let cached: boolean | null = null;
/** True when this browser can create a WebGL context. Checked once. */
export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    const c = document.createElement('canvas');
    cached = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    cached = false;
  }
  return cached;
}

const query = '(prefers-reduced-motion: reduce)';
/** Follows the operating system's reduced-motion setting live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
