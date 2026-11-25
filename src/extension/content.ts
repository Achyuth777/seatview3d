/// <reference types="chrome" />
/**
 * Content script for District (district.in). Private demo; not published.
 * - On any District movies page: remembers each film's landscape banner from the page's own
 *   structured data (schema.org Movie.image), so the seat page can show it on the 3D screen.
 * - On the seat-layout page: reads the seat map, adds an on/off switch and a side panel with the
 *   3D view. Hovering a seat previews its view; clicking selects it. The page's own booking flow
 *   is never changed, automated or intercepted: the visitor books and pays on District.
 */
import type { GridRow, PagePayload, SeatGrid, Slot, ViewerMessage } from './grid';

const SOURCE = 'seatview-district' as const;
const VIEWER_URL = chrome.runtime.getURL('viewer.html');
const VIEWER_ORIGIN = new URL(VIEWER_URL).origin;
const ALLOWED_IMAGE = /^https:\/\/cdn\.district\.in\//;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Film title → banner image, from structured data District publishes for search engines. */
async function rememberBanners() {
  const found: Record<string, string> = {};
  for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (o: unknown) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') {
          const r = o as Record<string, unknown>;
          if (r['@type'] === 'Movie' && typeof r.name === 'string' && typeof r.image === 'string' && ALLOWED_IMAGE.test(r.image)) found[norm(r.name)] = r.image;
          Object.values(r).forEach(walk);
        }
      };
      walk(JSON.parse(el.textContent ?? 'null'));
    } catch { /* not JSON */ }
  }
  if (!Object.keys(found).length) return;
  const { banners = {} } = (await chrome.storage.local.get('banners')) as { banners?: Record<string, string> };
  const merged = { ...banners, ...found };
  const keys = Object.keys(merged);
  for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete merged[k]; // keep it small
  await chrome.storage.local.set({ banners: merged });
}

/** Reads the seat map. Relies only on row lists, row letters, seat labels and slot positions. */
function readGrid(): SeatGrid | null {
  const rowEls = [...document.querySelectorAll('ul > li')].filter((li) => li.querySelector('[class*="seatL"]'));
  if (!rowEls.length) return null;
  const sample = rowEls[0]!.querySelector('[class*="seatL"]')!.children[0]?.getBoundingClientRect();
  const pitch = Math.max(1, (() => {
    const kids = [...rowEls[0]!.querySelector('[class*="seatL"]')!.children].map((c) => c.getBoundingClientRect().left);
    const gaps = kids.slice(1).map((x, i) => x - kids[i]!).filter((d) => d > 2);
    return gaps.length ? Math.min(...gaps) : (sample?.width ?? 30);
  })());
  const rows: GridRow[] = [];
  for (const li of rowEls) {
    const label = [...li.querySelectorAll('div,span')].find((d) => d.children.length === 0 && /^[A-Z]{1,2}$/.test(d.textContent?.trim() ?? ''))?.textContent?.trim();
    if (!label) continue;
    const slots: Slot[] = [...li.querySelector('[class*="seatL"]')!.children].map((slot) => {
      const r = slot.getBoundingClientRect();
      const x = (r.left + r.width / 2) / pitch;
      const span = slot.querySelector('span');
      const cls = span?.className.toString() ?? '';
      if (!span || /blank/i.test(cls)) return { kind: 'gap', x };
      const text = span.querySelector('label')?.textContent?.trim();
      const number = text && /^\d{1,3}$/.test(text) ? Number(text) : null;
      return { kind: 'seat', x, number, available: number !== null && !/disable|sold|occupied|blocked/i.test(cls) };
    });
    rows.push({ label, slots });
  }
  const screenEl = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && /screen this way/i.test(e.textContent ?? ''));
  const firstRowY = rowEls[0]!.getBoundingClientRect().top;
  return { rows, screenAtBottom: screenEl ? screenEl.getBoundingClientRect().top > firstRowY : true };
}

async function readPage(): Promise<PagePayload | null> {
  const grid = readGrid();
  if (!grid) return null;
  const film = document.querySelector('h1')?.textContent?.trim() ?? null;
  const showLine = [...document.querySelectorAll('h2,h3,p,div')].find((e) => e.children.length === 0 && / at .+,/.test(e.textContent ?? '') && /\d{1,2}:\d{2}/.test(e.textContent ?? ''))?.textContent?.trim() ?? null;
  const session = new URL(location.href).searchParams.get('encsessionid');
  const { banners = {} } = (await chrome.storage.local.get('banners')) as { banners?: Record<string, string> };
  const posterUrl = film ? banners[norm(film)] ?? null : null;
  const imax = /imax/i.test(document.querySelector('[class*="active"], [aria-selected="true"], [aria-pressed="true"]')?.textContent ?? '') || /imax/i.test(showLine ?? '');
  return { grid, film, showLine, cinemaId: session ? `CD${session.split('-')[0]}` : null, posterUrl, imax };
}

// ---- Panel and switch ----
let frame: HTMLIFrameElement | null = null;
let ready = false;
let lastSignature = '';
let enabled = false;

const post = (m: ViewerMessage) => { if (frame?.contentWindow && ready) frame.contentWindow.postMessage(m, VIEWER_ORIGIN); };

async function pushPage(force = false) {
  const payload = await readPage();
  if (!payload) return;
  const signature = JSON.stringify([payload.grid.rows.map((r) => [r.label, r.slots.map((s) => (s.kind === 'seat' ? `${s.number}${s.available ? 'a' : 'x'}` : '.'))]), payload.posterUrl]);
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  post({ source: SOURCE, type: 'page', payload });
}

function seatOf(target: EventTarget | null): { row: string; number: number } | null {
  const el = target instanceof Element ? target.closest('[class*="seatL"] > *') : null;
  const li = el?.closest('li');
  if (!el || !li) return null;
  const label = [...li.querySelectorAll('div,span')].find((d) => d.children.length === 0 && /^[A-Z]{1,2}$/.test(d.textContent?.trim() ?? ''))?.textContent?.trim();
  const slots = [...el.parentElement!.children];
  const grid = readGrid();
  const row = grid?.rows.find((r) => r.label === label);
  if (!label || !row) return null;
  const slot = row.slots[slots.indexOf(el)];
  if (!slot || slot.kind !== 'seat') return null;
  // Use the same numbering the viewer uses (filled in for seats without a visible number).
  const seatSlots = row.slots.map((s, i) => (s.kind === 'seat' ? i : -1)).filter((i) => i >= 0);
  const known = row.slots.flatMap((s, i) => (s.kind === 'seat' && s.number !== null ? [[i, s.number] as const] : []));
  const n = seatSlots.length;
  const rtl = (i: number) => n - seatSlots.indexOf(i);
  const ltr = (i: number) => seatSlots.indexOf(i) + 1;
  const useLtr = known.length > 0 && !known.every(([i, num]) => rtl(i) === num) && known.every(([i, num]) => ltr(i) === num);
  return { row: label, number: slot.number ?? (useLtr ? ltr(slots.indexOf(el)) : rtl(slots.indexOf(el))) };
}

function mountUi() {
  if (document.getElementById('seatview-district-root')) return;
  const host = document.createElement('div');
  host.id = 'seatview-district-root';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .switch { position: fixed; z-index: 2147483646; right: 16px; top: 88px; /* below the site header, clear of its bottom booking bar */ display: flex; align-items: center; gap: 10px;
        min-height: 44px; padding: 8px 14px; border: 0; border-radius: 0; background: #11305c; color: #eaf0f7; cursor: pointer;
        font: 600 14px/1.2 system-ui, sans-serif; box-shadow: 0 8px 24px -8px rgb(0 0 0 / .5); }
      .switch:focus-visible { outline: 3px solid #f2c230; outline-offset: 2px; }
      .knob { width: 34px; height: 20px; background: #4a72a8; position: relative; }
      .knob::after { content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; background: #eaf0f7; transition: left .15s; }
      [aria-pressed="true"] .knob { background: #f2c230; }
      [aria-pressed="true"] .knob::after { left: 17px; background: #16171a; }
      .panel { position: fixed; z-index: 2147483645; top: 0; right: 0; height: 100vh; width: min(440px, 100vw); border: 0; display: none;
        box-shadow: -12px 0 32px -12px rgb(0 0 0 / .45); background: #0b1a30; }
      .panel.on { display: block; }
      .switch:not(.off) { right: calc(min(440px, 100vw) + 16px); }
      @media (max-width: 760px) { .panel { top: auto; bottom: 0; height: 62vh; width: 100vw; } .switch { top: auto; bottom: 16px; } .switch:not(.off) { right: 16px; bottom: calc(62vh + 12px); } }
    </style>
    <button class="switch off" type="button" aria-pressed="false" aria-label="SeatView 3D view"><span class="knob" aria-hidden="true"></span><span>3D seat view</span></button>
    <iframe class="panel" title="SeatView 3D seat view" src="${VIEWER_URL}" allow="" loading="lazy"></iframe>`;
  document.documentElement.appendChild(host);
  const button = shadow.querySelector('button')!;
  frame = shadow.querySelector('iframe')!;
  const apply = () => {
    button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('off', !enabled);
    frame!.classList.toggle('on', enabled);
    // On wide screens, make room so the panel never hides seats on the map.
    document.documentElement.style.marginRight = enabled && window.innerWidth >= 1100 ? 'min(440px, 100vw)' : '';
    if (enabled) void pushPage(true);
  };
  button.addEventListener('click', () => { enabled = !enabled; void chrome.storage.local.set({ enabled }); apply(); });
  void chrome.storage.local.get('enabled').then((v) => { enabled = v.enabled === true; apply(); });
}

function watchSeats() {
  let hoverTimer = 0;
  document.addEventListener('mouseover', (e) => {
    if (!enabled) return;
    const s = seatOf(e.target);
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      if (s) post({ source: SOURCE, type: 'seat', ...s, mode: 'hover' });
      else post({ source: SOURCE, type: 'seat', row: '', number: 0, mode: 'leave' });
    }, 60);
  }, true);
  document.addEventListener('click', (e) => {
    if (!enabled) return;
    const s = seatOf(e.target);
    if (s) post({ source: SOURCE, type: 'seat', ...s, mode: 'select' });
    window.setTimeout(() => void pushPage(), 250); // availability changes after a click
  }, true);
  new MutationObserver(() => { window.clearTimeout(observeTimer); observeTimer = window.setTimeout(() => void pushPage(), 400); })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
}
let observeTimer = 0;

window.addEventListener('message', (e) => {
  if (e.origin !== VIEWER_ORIGIN || (e.data as { source?: string })?.source !== SOURCE) return;
  if ((e.data as { type?: string }).type === 'ready') { ready = true; void pushPage(true); }
});

void rememberBanners();
if (/^\/movies\/seat-layout\//.test(location.pathname)) {
  const start = () => { if (readGrid()) { mountUi(); watchSeats(); return true; } return false; };
  if (!start()) {
    const obs = new MutationObserver(() => { if (start()) obs.disconnect(); });
    obs.observe(document.documentElement, { subtree: true, childList: true });
  }
}
