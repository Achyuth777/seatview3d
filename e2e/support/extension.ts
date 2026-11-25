import { chromium, type BrowserContext } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Chromium with the built extension (npm run build:extension) loaded, like "Load unpacked". */
export async function withExtension(opts: { video?: string } = {}): Promise<BrowserContext> {
  const dir = resolve('extension-dist');
  return chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'seatview-ext-')), {
    // Extensions need a full browser in its new headless mode (the headless shell can't load them).
    // EXT_BROWSER picks one: Microsoft Edge by default here, or "chromium" for Playwright's own build.
    ...(process.env.EXT_BROWSER === 'chromium' ? {} : { channel: 'msedge' }),
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ['--headless=new', `--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
    ...(opts.video ? { recordVideo: { dir: opts.video, size: { width: 1440, height: 900 } } } : {}),
  });
}

/**
 * A stand-in for District's seat-layout page with the same structure the content script reads
 * (row lists, row letters, seat slots, "available" seats with numbers, blanks, taken seats).
 * Written for tests; it is not District's markup or content.
 */
export function seatPageHtml(rows: { label: string; pattern: string }[], film = 'Test Film') {
  const slot = (t: string) =>
    t === '.' ? '<div class="m__seatDiv"><span class="m__blank"></span></div>'
      : t.startsWith('a') ? `<div class="m__seatDiv"><span class="available" data-seat="${t.slice(1)}"><label>${t.slice(1)}</label></span></div>`
        : '<div class="m__seatDiv"><span class="m__disable">x</span></div>';
  return `<!doctype html><html><head><title>${film} tickets</title><style>
    body{font-family:sans-serif;margin:40px} li{display:flex;align-items:center;gap:12px;list-style:none;margin:6px 0}
    .m__seatL{display:flex;gap:6px} .m__seatDiv{width:26px;height:26px} .m__seatDiv span{display:grid;place-items:center;width:26px;height:26px;border:1px solid #999;font-size:11px}
    .m__blank{border:0!important} .available{cursor:pointer} .clicked{background:#7c5cff;color:#fff}
  </style></head><body><h1>${film}</h1><p>25 Nov, 08:00 PM at Test Cinema, Chennai</p>
  <div class="m__rightRow"><ul>${rows.map((r) => `<li><div><div>${r.label}</div></div><div class="m__seatL">${r.pattern.split(' ').map(slot).join('')}</div></li>`).join('')}</ul></div>
  <div style="margin-top:30px;text-align:center">SCREEN THIS WAY</div>
  <script>document.addEventListener('click',e=>{const s=e.target.closest('.available');if(s){s.classList.toggle('clicked');document.body.dataset.pageClick=s.dataset.seat}})</script>
  </body></html>`;
}

export const cinemaPageHtml = (film: string, image: string) => `<!doctype html><html><head><title>Test Cinema</title>
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'ScreeningEvent', workPresented: { '@type': 'Movie', name: film, image } })}</script>
  </head><body><h1>Test Cinema</h1></body></html>`;

/** A plain 16:9 test banner (coach blue to signal yellow): stands in for a film banner in tests. */
export function testBannerPng(): Buffer {
  const W = 640, H = 360;
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = x / W, i = y * (W * 3 + 1) + 1 + x * 3;
    const band = Math.floor(y / 60) % 2 ? 0.85 : 1;
    raw[i] = Math.round((17 + (242 - 17) * t) * band); raw[i + 1] = Math.round((48 + (194 - 48) * t) * band); raw[i + 2] = Math.round((92 + (48 - 92) * t) * band);
  }
  const crc = (b: Buffer) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
