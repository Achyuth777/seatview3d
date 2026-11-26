/// <reference types="chrome" />
/**
 * Content script for District and PVR INOX. Private demo; not published.
 * - On District movies pages: remembers each film's landscape banner from the page's own
 *   structured data (schema.org Movie.image), so the seat page can show it on the 3D screen.
 * - On a seat-selection page: reads the seat map, adds an on/off switch and a side panel with the
 *   3D view. Hovering a seat previews its view; clicking selects it. The page's own booking flow
 *   is never changed, automated or intercepted: the visitor books and pays on the site.
 */
import type { GridRow, PagePayload, SeatGrid, Slot, ViewerMessage } from './grid';
import { district, siteForPage, type SiteReader } from './sites';

const SOURCE = 'seatview-district' as const;
const VIEWER_URL = chrome.runtime.getURL('viewer.html');
const VIEWER_ORIGIN = new URL(VIEWER_URL).origin;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The reader for the page that's open (null when it isn't a seat page). */
let site: SiteReader | null = null;
/** The page's row elements, in the same order as the rows of the last grid read. */
let rowElements: Element[] = [];

/** Film title → banner image, from structured data District publishes for search engines. */
async function rememberBanners() {
  if (location.hostname !== 'www.district.in') return;
  const found: Record<string, string> = {};
  for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (o: unknown) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') {
          const r = o as Record<string, unknown>;
          if (r['@type'] === 'Movie' && typeof r.name === 'string' && typeof r.image === 'string' && district.imageHost.test(r.image)) found[norm(r.name)] = r.image;
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

/** Reads the seat map. Relies only on row elements, row letters, seat labels and slot positions. */
function readGrid(): SeatGrid | null {
  if (!site) return null;
  const s = site;
  const rowEls = s.rowElements();
  if (!rowEls.length) return null;
  const firstSlots = s.slots(rowEls[0]!);
  const pitch = Math.max(1, (() => {
    const xs = firstSlots.map((c) => c.getBoundingClientRect().left);
    const gaps = xs.slice(1).map((x, k) => x - xs[k]!).filter((d) => d > 2);
    return gaps.length ? Math.min(...gaps) : (firstSlots[0]?.getBoundingClientRect().width ?? 30);
  })());
  const rows: GridRow[] = [];
  const kept: Element[] = [];
  const seen = new Map<string, number>();
  for (const el of rowEls) {
    const letter = s.rowLetter(el);
    if (!letter) continue;
    const slots: Slot[] = s.slots(el).map((slot) => {
      const r = slot.getBoundingClientRect();
      const x = (r.left + r.width / 2) / pitch;
      const read = s.readSlot(slot);
      return read.kind === 'gap' ? { kind: 'gap', x } : { kind: 'seat', x, number: read.number, available: read.available };
    });
    if (!slots.some((x) => x.kind === 'seat')) continue;
    const count = (seen.get(letter) ?? 0) + 1;
    seen.set(letter, count);
    kept.push(el);
    rows.push({ label: count === 1 ? letter : `${letter}#${count}`, slots, area: s.area(el) });
  }
  if (!rows.length) return null;
  rowElements = kept;
  const screenEl = s.screenElement();
  const firstRowY = kept[0]!.getBoundingClientRect().top;
  return { rows, screenAtBottom: screenEl ? screenEl.getBoundingClientRect().top > firstRowY : true };
}

async function readPage(): Promise<PagePayload | null> {
  const grid = readGrid();
  if (!grid || !site) return null;
  const film = site.film();
  const showLine = site.showLine();
  const session = site === district ? new URL(location.href).searchParams.get('encsessionid') : null;
  const { banners = {} } = (await chrome.storage.local.get('banners')) as { banners?: Record<string, string> };
  const posterUrl = site.pagePoster() ?? (film ? banners[norm(film)] ?? null : null);
  const imax = /imax/i.test(document.querySelector('[class*="active"], [aria-selected="true"], [aria-pressed="true"]')?.textContent ?? '') || /imax/i.test(showLine ?? '');
  return { site: site.name, grid, film, showLine, cinemaId: session ? `CD${session.split('-')[0]}` : null, posterUrl, imax };
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
  if (!site || !(target instanceof Element)) return null;
  const el = site.slotAt(target);
  if (!el) return null;
  const grid = readGrid();
  const index = rowElements.findIndex((r) => r.contains(el));
  const row = grid?.rows[index];
  if (!row) return null;
  const slots = site.slots(rowElements[index]!);
  const label = row.label;
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
let watching = false;
let syncTimer = 0;
function unmountUi() {
  document.getElementById('seatview-district-root')?.remove();
  document.documentElement.style.marginRight = '';
  frame = null;
  ready = false;
  lastSignature = '';
}
/** Mounts the switch on seat pages and removes it elsewhere; re-checked as single-page sites navigate. */
function sync() {
  site = siteForPage();
  const mounted = !!document.getElementById('seatview-district-root');
  if (site && readGrid()) {
    if (!mounted) mountUi();
    if (!watching) { watchSeats(); watching = true; }
  } else if (!site && mounted) unmountUi();
}
sync();
new MutationObserver(() => { window.clearTimeout(syncTimer); syncTimer = window.setTimeout(sync, 300); })
  .observe(document.documentElement, { subtree: true, childList: true });
