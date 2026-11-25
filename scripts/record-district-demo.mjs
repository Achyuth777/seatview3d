// Records the private demo on the real District site, LOOK ONLY: it opens pages and points at seats.
// It never clicks a seat, never books, never signs in. Usage: npm run build:extension && node scripts/record-district-demo.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CINEMA = process.argv[2] ?? 'https://www.district.in/movies/pvr-palazzo-the-nexus-vijaya-mall-chennai-CD1022274';
const out = resolve('docs/extension');
const vids = mkdtempSync(join(tmpdir(), 'svx-video-'));
mkdirSync(out, { recursive: true });
const ext = resolve('extension-dist');
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'svx-')), {
  ...(process.env.EXT_BROWSER === 'chromium' ? {} : { channel: 'msedge' }), headless: false,
  viewport: { width: 1440, height: 900 }, recordVideo: { dir: vids, size: { width: 1440, height: 900 } },
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const page = await ctx.newPage();
try {
  await page.goto(CINEMA, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // the extension remembers film banners from this page
  const seatLink = await page.locator('a[href*="/movies/seat-layout/"]').first().getAttribute('href');
  if (!seatLink) throw new Error('No showtime link found on the cinema page');
  await page.goto(new URL(seatLink, CINEMA).href, { waitUntil: 'domcontentloaded' });
  const toggle = page.locator('#seatview-district-root button');
  await toggle.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, 'live-1-seat-map.png') });
  await toggle.click(); // our own switch, not District's page
  const panel = page.frameLocator('iframe[title="SeatView 3D seat view"]');
  await panel.locator('main[data-rows]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(out, 'live-2-overview.png') });
  const info = await panel.locator('main').evaluate((m) => ({ rows: m.dataset.rows, banner: m.dataset.banner }));
  console.log('panel', JSON.stringify(info), 'film:', await panel.locator('.xv-film').textContent());
  // Point (hover only) at seats: back row, middle, front.
  // Only seats in view, clear of the panel (seats behind it are reached by scrolling the map).
  const seats = page.locator('span.available');
  const panelLeft = (await page.locator('#seatview-district-root iframe').boundingBox()).x;
  const visible = [];
  for (let k = 0; k < await seats.count(); k++) {
    const b = await seats.nth(k).boundingBox();
    if (b && b.x + b.width < panelLeft - 4 && b.y > 120 && b.y + b.height < 780) visible.push(k);
  }
  console.log('available seats in view:', visible.length);
  const picks = [...new Set([visible[0], visible[Math.floor(visible.length / 2)], visible.at(-1)])].filter((k) => k !== undefined);
  for (const [i, k] of picks.entries()) {
    await seats.nth(k).hover();
    await page.waitForTimeout(3500);
    const seat = await panel.locator('.xv-seat').textContent().catch(() => null);
    console.log('hover', k, '->', seat, '| camera at', await panel.locator('main').getAttribute('data-camera-seat'));
    await page.screenshot({ path: join(out, `live-${3 + i}-preview.png`) });
  }
  await page.mouse.move(5, 5);
  await page.waitForTimeout(2500);
} finally {
  await page.close();
  await ctx.close();
  const v = readdirSync(vids).find((f) => f.endsWith('.webm'));
  if (v) { renameSync(join(vids, v), join(out, 'demo.webm')); console.log('video: docs/extension/demo.webm'); }
  rmSync(vids, { recursive: true, force: true });
}
