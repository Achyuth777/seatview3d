import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';
import { cinemaPageHtml, pvrSeatTableHtml, pvrShellHtml, seatPageHtml, testBannerPng, withExtension } from './support/extension';

/**
 * The private-demo extension against stand-in pages served at District's addresses (no traffic to District).
 * Build first: npm run build:extension. Runs once, in its own Chromium (the project setting is ignored).
 */
const dir = 'docs/extension';
mkdirSync(dir, { recursive: true });
const CINEMA = 'https://www.district.in/movies/test-cinema-chennai-CD1022274';
const SEATS = 'https://www.district.in/movies/seat-layout/test?encsessionid=1022274-1-a-b&type=CINEMAS&contentid=1';
const BANNER = 'https://cdn.district.in/movies-assets/images/cinema/test-banner.png';
const ROWS = [
  { label: 'A', pattern: '. x x a20 a19 x x x x . . x x x x x x . . . a8 x a6 x x a3 a2 a1' },
  { label: 'B', pattern: 'x x a21 x x x x . . . x a15 x x x x x x x . . . x x x x x x a1' },
  { label: 'C', pattern: 'a23 a22 x x x x x . . . a16 x x x x x x x x . . . x x x x x x x' },
  { label: 'D', pattern: '. . . . . . . . . . . . x x a5 a4 x . . . . . . . . . .' },
];
// Two seating areas that both start at row A, as on Kamala Cinemas' couple-seat layout (25 Nov 2026).
const AREA_ROWS = [
  { label: 'A', pattern: 'a1 a2 . a3 a4', area: 'COUPLE SEAT LOUNGE' },
  { label: 'B', pattern: 'a1 a2 . a3 a4', area: 'COUPLE SEAT LOUNGE' },
  { label: 'A', pattern: 'x a2 a3 x . a5 a6', area: 'ELITE' },
];

let context: BrowserContext;
test.beforeAll(async ({ browserName }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'chromium-desktop', 'runs once, in Chromium with the extension');
  context = await withExtension();
  await context.route('https://www.district.in/movies/**', (r) => {
    const url = r.request().url();
    const body = url.includes('broken') ? '<h1>Changed page</h1>' : url.includes('/seat-layout/areas') ? seatPageHtml(AREA_ROWS) : url.includes('/seat-layout/') ? seatPageHtml(ROWS) : cinemaPageHtml('Test Film', BANNER);
    return r.fulfill({ contentType: 'text/html', body });
  });
  // PVR: screen at the top, front rows first (as on PVR Palazzo, 26 Nov 2026).
  const palazzo = JSON.parse(readFileSync('e2e/fixtures/pvr-palazzo-2026-11-26.json', 'utf8')) as { areas: Parameters<typeof pvrSeatTableHtml>[0] };
  await context.route('https://www.pvrcinemas.com/**', (r) => r.fulfill({ contentType: 'text/html', body: pvrShellHtml(r.request().url().includes('palazzo') ? pvrSeatTableHtml(palazzo.areas, 'https://originserver-static1-uat.pvrcinemas.com/pvrcms/movie_v/test.jpg') : pvrSeatTableHtml([
    { name: 'BUDGET', rows: [{ label: 'C', pattern: 'x1 a2 . . x3 x4 a5' }] },
    { name: 'ELITE', rows: [{ label: 'B', pattern: 'a1 x2 . . a3 x4 a5' }, { label: 'A', pattern: 'x1 x2 . . a3 a4 x5' }] },
  ], 'https://originserver-static1-uat.pvrcinemas.com/pvrcms/movie_v/test.jpg')) }));
  await context.route('https://originserver-static1-uat.pvrcinemas.com/**', (r) => r.fulfill({ contentType: 'image/png', body: testBannerPng() }));
  await context.route('https://cdn.district.in/**', (r) => r.fulfill({ contentType: 'image/png', body: testBannerPng() }));
});
test.afterAll(async () => { await context?.close(); });

test('switch on: the panel rebuilds the hall from the seat map, shows the banner, previews and keeps seats', async () => {
  const page = await context.newPage();
  await page.goto(CINEMA); // remembers the film's banner, as a visitor passing through the cinema page would
  await expect(page.locator('#seatview-district-root')).toHaveCount(0); // no switch outside the seat map
  await page.waitForTimeout(300);
  await page.goto(SEATS);
  const toggle = page.locator('#seatview-district-root button');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  const panel = page.frameLocator('iframe[title="SeatView 3D seat view"]');
  const main = panel.locator('main');
  await expect(main).toHaveAttribute('data-rows', '4', { timeout: 20_000 });
  await expect(panel.getByText('Illustrative: real seat map, estimated sizes')).toBeVisible();
  await expect(panel.locator('.xv-film')).toHaveText('Test Film');
  await expect(main).toHaveAttribute('data-banner', 'loaded');
  // The panel fills the window height and the 3D view gets real space (a plain iframe would stay 150 px tall).
  const box = await page.locator('#seatview-district-root iframe').boundingBox();
  expect(box!.height).toBeGreaterThan(850);
  const canvas = await panel.locator('canvas').boundingBox();
  expect(canvas!.height).toBeGreaterThan(400);

  await page.locator('[data-seat="15"]').hover();
  await expect(main).toHaveAttribute('data-view-seat', 'B15');
  await expect(panel.locator('.xv-seat')).toHaveText('Preview · Row B · Seat 15');
  await expect(panel.locator('.xv-figs')).toContainText('of view');
  await expect(main).toHaveAttribute('data-camera-seat', 'B15', { timeout: 15_000 }); // the camera has arrived
  // The panel never hides seats: the rightmost seat stays clickable.
  const lastSeat = await page.locator('[data-seat="1"]').first().boundingBox();
  const panelBox = await page.locator('#seatview-district-root iframe').boundingBox();
  expect(lastSeat!.x + lastSeat!.width).toBeLessThan(panelBox!.x);
  await page.screenshot({ path: `${dir}/fixture-preview.png` });

  await page.mouse.move(5, 5);
  await expect(main).toHaveAttribute('data-view-seat', 'overview');
  await page.locator('[data-seat="4"]').click();
  await expect(panel.locator('.xv-seat')).toHaveText('Your seat · Row D · Seat 4');
  expect(await page.evaluate(() => document.body.dataset.pageClick)).toBe('4'); // the page's own click still ran
  await page.mouse.move(5, 5);
  await expect(main).toHaveAttribute('data-view-seat', 'D4'); // leaving keeps the chosen seat

  // A taken seat (no number on the page) still previews, numbered as the page numbers it.
  await page.locator('li').nth(1).locator('.m__seatDiv').nth(3).hover();
  await expect(main).toHaveAttribute('data-view-seat', 'B20');
  await page.close();
});

test('a row letter used in two seating areas previews the right row and names the area', async () => {
  const page = await context.newPage();
  await page.goto('https://www.district.in/movies/seat-layout/areas?encsessionid=5059-1');
  const panel = page.frameLocator('iframe[title="SeatView 3D seat view"]');
  await expect(panel.locator('main')).toHaveAttribute('data-rows', '3', { timeout: 20_000 }); // switch is still on from the first test
  await page.locator('li').nth(2).locator('[data-seat="5"]').hover();
  await expect(panel.locator('main')).toHaveAttribute('data-view-seat', 'A#25');
  await expect(panel.locator('.xv-seat')).toHaveText('Preview · Elite · Row A · Seat 5');
  await page.locator('li').nth(0).locator('[data-seat="3"]').hover();
  await expect(panel.locator('.xv-seat')).toHaveText('Preview · Couple Seat Lounge · Row A · Seat 3');
  await page.close();
});

test('PVR INOX: the switch appears when the app moves to the seat map, and the panel reads PVR’s seat table', async () => {
  const page = await context.newPage();
  await page.goto('https://www.pvrcinemas.com/cinemasessions/Chennai/test/1');
  await page.waitForTimeout(800);
  await expect(page.locator('#seatview-district-root')).toHaveCount(0); // not a seat page yet
  await page.locator('#go').click(); // the site's own in-app navigation, no reload
  const panel = page.frameLocator('iframe[title="SeatView 3D seat view"]');
  const main = panel.locator('main');
  await expect(main).toHaveAttribute('data-rows', '3', { timeout: 20_000 }); // switch is still on from the first test
  await expect(panel.locator('.xv-film')).toHaveText('TEST FILM');
  await expect(main).toHaveAttribute('data-banner', 'loaded');
  await expect(panel.locator('.xv-note')).toHaveText('Thu, 26 Nov, 10:55 PM - 1:08 AM at Test Cinema Chennai');
  await expect(panel.locator('.xv-foot')).toHaveText('Book and pay on PVR INOX as usual. SeatView only shows the view.');
  // Row C is nearest the screen (the top of PVR's map), so it's the front row and closest.
  await page.locator('tr.seats-row').nth(0).locator('[data-seat="5"]').hover();
  await expect(main).toHaveAttribute('data-view-seat', 'C5');
  const front = await panel.locator('.xv-figs').innerText();
  await page.locator('tr.seats-row').nth(2).locator('[data-seat="3"]').hover();
  await expect(main).toHaveAttribute('data-view-seat', 'A3');
  const back = await panel.locator('.xv-figs').innerText();
  const metres = (t: string) => Number(/about (\d+) m/.exec(t)![1]);
  expect(metres(back)).toBeGreaterThan(metres(front));
  await page.locator('tr.seats-row').nth(1).locator('[data-seat="1"]').click();
  await expect(panel.locator('.xv-seat')).toHaveText('Your seat · Row B · Seat 1');
  expect(await page.evaluate(() => document.body.dataset.pageClick)).toBe('1'); // PVR's own click still ran
  await page.close();
});

test('PVR INOX: a real PVR Palazzo layout (12 rows, aisles, a short front row) reads front to back', async () => {
  const page = await context.newPage();
  await page.goto('https://www.pvrcinemas.com/cinemasessions/palazzo');
  await page.locator('#go').click();
  const panel = page.frameLocator('iframe[title="SeatView 3D seat view"]');
  const main = panel.locator('main');
  await expect(main).toHaveAttribute('data-rows', '12', { timeout: 20_000 });
  const metresAt = async (row: number, seat: string, id: string) => {
    await page.locator('tr.seats-row').nth(row).locator(`[data-seat="${seat}"]`).hover();
    await expect(main).toHaveAttribute('data-view-seat', id);
    return Number(/about (\d+) m/.exec(await panel.locator('.xv-figs').innerText())![1]);
  };
  const l = await metresAt(0, '3', 'L3'); // short row right under the screen
  const f = await metresAt(6, '5', 'F5');
  const a = await metresAt(11, '13', 'A13');
  expect(l).toBeLessThan(f);
  expect(f).toBeLessThan(a);
  await expect(main).toHaveAttribute('data-camera-seat', 'A13', { timeout: 15_000 }); // the camera has arrived
  await page.screenshot({ path: `${dir}/pvr-fixture-preview.png` });
  await page.close();
});

test('the switch remembers its state, and turning it off hides the panel', async () => {
  const page = await context.newPage();
  await page.goto(SEATS);
  const toggle = page.locator('#seatview-district-root button');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.locator('#seatview-district-root iframe')).toBeHidden();
  await page.reload();
  await expect(page.locator('#seatview-district-root button')).toHaveAttribute('aria-pressed', 'false');
  await page.close();
});

test('failure: a page whose seat map can’t be read gets no switch and no errors', async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('https://www.district.in/movies/seat-layout/broken?encsessionid=1-2');
  await page.waitForTimeout(1200);
  await expect(page.locator('#seatview-district-root')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.close();
});

test('failure: a missing banner leaves the measured screen grid, and says how to get the banner', async () => {
  const fresh = await withExtension();
  await fresh.route('https://www.district.in/movies/**', (r) => r.fulfill({ contentType: 'text/html', body: seatPageHtml(ROWS, 'Unseen Film') }));
  const page = await fresh.newPage();
  await page.goto(SEATS);
  await page.locator('#seatview-district-root button').click();
  const panel = page.frameLocator('iframe[title="SeatView 3D seat view"]');
  await expect(panel.locator('main')).toHaveAttribute('data-banner', 'none', { timeout: 20_000 });
  await panel.getByText('How this view is made').click();
  await expect(panel.getByText(/Open the cinema or film page on District first/)).toBeVisible();
  await fresh.close();
});
