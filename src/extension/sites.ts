/**
 * How to read each booking site's seat page. Each reader only looks at the page the visitor already
 * has open; nothing is fetched from the site. Structures were inspected on the live sites on
 * 25–26 Nov 2026 (District: CSS-module lists; PVR INOX: a seat table).
 */

/** What a reader reports for one slot in a row. */
export type SlotRead = { kind: 'gap' } | { kind: 'seat'; number: number | null; available: boolean };

export interface SiteReader {
  /** Short name shown in the panel ("Book and pay on {name} as usual"). */
  name: string;
  /** Whether the current page is a seat-selection page (checked again on in-app navigation). */
  isSeatPage(): boolean;
  /** Row elements in page order. */
  rowElements(): Element[];
  /** The row's letter as printed on the page. */
  rowLetter(row: Element): string | undefined;
  /** The row's slot elements (seats and gaps), left to right. */
  slots(row: Element): Element[];
  readSlot(slot: Element): SlotRead;
  /** The slot element under the pointer, if any. */
  slotAt(target: Element): Element | null;
  /** The seating area's name for a row, when the page shows one. */
  area(row: Element): string | undefined;
  /** The element that marks the screen, to tell which end of the map is nearest it. */
  screenElement(): Element | null;
  film(): string | null;
  showLine(): string | null;
  /** A film image found on this page, if the site shows one. */
  pagePoster(): string | null;
  /** Images may only be loaded from these hosts. */
  imageHost: RegExp;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (ch) => ch.toUpperCase());
const leafText = (root: ParentNode, re: RegExp) =>
  [...root.querySelectorAll('div,span')].find((d) => d.children.length === 0 && re.test(d.textContent?.trim() ?? ''))?.textContent?.trim();
const seatNumber = (text: string | null | undefined) => (text && /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null);

export const district: SiteReader = {
  name: 'District',
  imageHost: /^https:\/\/cdn\.district\.in\//,
  isSeatPage: () => location.hostname === 'www.district.in' && /^\/movies\/seat-layout\//.test(location.pathname),
  rowElements: () => [...document.querySelectorAll('ul > li')].filter((li) => li.querySelector('[class*="seatL"]')),
  rowLetter: (li) => leafText(li, /^[A-Z]{1,2}$/),
  slots: (li) => [...(li.querySelector('[class*="seatL"]')?.children ?? [])],
  readSlot(slot) {
    const span = slot.querySelector('span');
    const cls = span?.className.toString() ?? '';
    if (!span || /blank/i.test(cls)) return { kind: 'gap' };
    const number = seatNumber(span.querySelector('label')?.textContent);
    return { kind: 'seat', number, available: number !== null && !/disable|sold|occupied|blocked/i.test(cls) };
  },
  slotAt: (t) => t.closest('[class*="seatL"] > *'),
  area(li) {
    // The heading just above the row list, e.g. "COUPLE SEAT ELITE : ₹150".
    const text = li.closest('ul')?.parentElement?.previousElementSibling?.textContent?.trim() ?? '';
    if (!/[:₹]/.test(text)) return undefined;
    const name = text.split(/[:₹]/)[0]!.trim();
    return name ? titleCase(name) : undefined;
  },
  screenElement: () => [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && /screen this way/i.test(e.textContent ?? '')) ?? null,
  film: () => document.querySelector('h1')?.textContent?.trim() ?? null,
  showLine: () =>
    [...document.querySelectorAll('h2,h3,p,div')].find((e) => e.children.length === 0 && / at .+,/.test(e.textContent ?? '') && /\d{1,2}:\d{2}/.test(e.textContent ?? ''))?.textContent?.trim() ?? null,
  pagePoster: () => null, // District's seat page has no film image; banners come from cinema/film pages.
};

export const pvr: SiteReader = {
  name: 'PVR INOX',
  imageHost: /^https:\/\/[a-z0-9-]+\.pvrcinemas\.com\//,
  isSeatPage: () => /(^|\.)pvrcinemas\.com$/.test(location.hostname) && /^\/seatlayout\//.test(location.pathname),
  rowElements: () => [...document.querySelectorAll('tr.seats-row')].filter((tr) => tr.querySelector('.seat-row-no')),
  rowLetter: (tr) => tr.querySelector('.seat-row-no')?.textContent?.trim() || undefined,
  slots: (tr) => [...tr.querySelectorAll(':scope > td')].filter((td) => !td.querySelector('.seat-row-no')),
  readSlot(td) {
    const span = td.querySelector('span');
    const cls = span?.className.toString() ?? '';
    if (!span || /hidden|blank|space/i.test(cls)) return { kind: 'gap' };
    return { kind: 'seat', number: seatNumber(span.textContent), available: !/disable|occupied|sold|booked|block/i.test(cls) };
  },
  slotAt: (t) => t.closest('tr.seats-row > td'),
  area(tr) {
    // The last area heading ("BUDGET", "ELITE") before this row in the page.
    let name: string | undefined;
    for (const h of document.querySelectorAll('.seat-category-name')) {
      if (h.compareDocumentPosition(tr) & Node.DOCUMENT_POSITION_FOLLOWING) name = h.textContent?.trim();
    }
    return name ? titleCase(name) : undefined;
  },
  screenElement: () => document.querySelector('.screen'),
  film: () => document.querySelector('.summary-movies-content h5')?.textContent?.trim() ?? null,
  showLine() {
    const lines = (document.querySelector('.summary-movies-content') as HTMLElement | null)?.innerText.split('\n').map((l) => l.trim()).filter(Boolean) ?? [];
    const when = lines.find((l) => /\d{1,2}:\d{2}\s?[AP]M/i.test(l));
    const where = lines.at(-1);
    return when && where && where !== when ? `${when} at ${where}` : when ?? null;
  },
  pagePoster() {
    const src = document.querySelector<HTMLImageElement>('.summary-movies-photo img')?.src ?? '';
    return pvr.imageHost.test(src) ? src : null;
  },
};

export const SITES = [district, pvr];
export const siteForPage = () => SITES.find((s) => s.isSeatPage()) ?? null;
