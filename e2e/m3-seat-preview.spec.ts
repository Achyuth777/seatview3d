import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { lowPowerProfile } from './support/perf';

const dir = 'docs/screenshots/M3';
mkdirSync(dir, { recursive: true });
const PREVIEW = '/preview/demo-hall-chennai-1';
const size = (name: string) => (name.includes('desktop') ? '1440' : '390');
const seat = (page: Page, id: string) => page.locator(`[data-seat="${id}"]`);
const stage = (page: Page) => page.locator('.pv-stage');

/** The camera reports rest only for the latest pose; its position must match that seat's eye point. */
async function expectCameraAt(page: Page, id: string) {
  await expect(stage(page)).toHaveAttribute('data-camera-seat', id, { timeout: 15_000 });
  const [eye, pos] = await Promise.all([stage(page).getAttribute('data-target-eye'), stage(page).getAttribute('data-camera-pos')]);
  const a = eye!.split(',').map(Number), b = pos!.split(',').map(Number);
  expect(Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)).toBeLessThan(0.05);
}

test('compare two seats without losing the first', async ({ page }, info) => {
  await page.goto(`${PREVIEW}?seat=K12&instant=1`);
  await expectCameraAt(page, 'K12');
  await page.getByRole('button', { name: 'Compare a seat' }).click();
  await expect(page.getByText('Seat A stays where it is')).toBeVisible();
  await seat(page, 'C3').click();
  await expect(seat(page, 'K12')).toHaveAttribute('data-state', 'other');
  await expect(seat(page, 'C3')).toHaveAttribute('data-state', 'view');
  const table = page.locator('.pv-compare__table');
  await expect(table).toContainText('A K12');
  await expect(table).toContainText('B C3');
  await expectCameraAt(page, 'C3');
  await page.getByRole('button', { name: /^A K12/ }).click();
  await expectCameraAt(page, 'K12');
  await expect(page).toHaveURL(/seat=K12.*compare=C3/);
  await page.screenshot({ path: `${dir}/compare-${size(info.project.name)}.png` });
  await page.reload();
  await expect(page.locator('.pv-compare__table')).toContainText('B C3');
  await page.getByRole('button', { name: 'Done comparing' }).click();
  await expect(page.locator('.pv-compare')).toHaveCount(0);
});

test('phone: the detail sheet keeps the selected seat visible', async ({ page }, info) => {
  test.skip(size(info.project.name) !== '390', 'phone layout only');
  await page.goto(`${PREVIEW}?instant=1`);
  for (const id of ['A1', 'O22', 'H11']) {
    await seat(page, id).click();
    const visible = await seat(page, id).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.top >= 0 && r.bottom <= window.innerHeight && hit === el;
    });
    expect(visible, id).toBe(true);
  }
  // Compare mode too: both seats stay on screen.
  await page.getByRole('button', { name: 'Compare a seat' }).click();
  await seat(page, 'B3').click();
  for (const id of ['H11', 'B3']) {
    expect(await seat(page, id).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }), `compare ${id}`).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${dir}/compare-sheet-390.png` });
});

test('reduced motion switches the camera instantly', async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(PREVIEW);
  await expect(stage(page)).toHaveAttribute('data-camera-seat', 'overview', { timeout: 20_000 });
  const t0 = Date.now();
  await seat(page, 'K12').click();
  await expectCameraAt(page, 'K12');
  expect(Date.now() - t0).toBeLessThan(1200);
  await expect(page.locator('.pv-stage__label--still')).toBeVisible();
  await context.close();
});

test('keyboard: arrows move between seats, Enter selects, focus is visible', async ({ page }) => {
  await page.goto(`${PREVIEW}?seat=K12&instant=1`);
  await page.locator('[data-seat="K12"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-seat'));
  expect(focused).toBe('J13');
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.activeElement!).strokeWidth))).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('.pv-sheet h1')).toHaveText('Row J · Seat 13');
  await expectCameraAt(page, 'J13');
});

test('3D loads lazily: discovery pages never download it', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await page.goto('/');
  await page.goto('/movies?city=chennai');
  await page.waitForLoadState('networkidle');
  expect(scripts.some((u) => /PreviewCanvas|CinemaScene|BookView/.test(u))).toBe(false);
  await page.goto(`${PREVIEW}?seat=K12&instant=1`);
  await expect(page.locator('.pv-stage canvas')).toBeVisible({ timeout: 20_000 });
  expect(scripts.some((u) => /PreviewCanvas/.test(u))).toBe(true);
});

test('failure: a slow 3D download leaves the seat map usable', async ({ page }) => {
  await page.route(/PreviewCanvas-.*\.js$/, async (r) => { await new Promise((res) => setTimeout(res, 4000)); await r.continue(); });
  await page.goto(PREVIEW);
  await expect(page.getByText('Loading the 3D hall…')).toBeVisible();
  await seat(page, 'H9').click();
  await expect(page.locator('.pv-sheet h1')).toHaveText('Row H · Seat 9');
  await expectCameraAt(page, 'H9');
});

test('failure: an unknown auditorium shows not found, not a generic map', async ({ page }) => {
  await page.goto('/preview/no-such-auditorium');
  await expect(page.locator('body')).toContainText(/isn’t on the chart|not found/i);
  await expect(page.locator('.pv-map')).toHaveCount(0);
});

test('low-power profile: selection still lands on the last seat', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling needs the Chromium DevTools protocol');
  await page.goto(`${PREVIEW}?seat=K12`);
  await expectCameraAt(page, 'K12');
  await lowPowerProfile(page);
  await seat(page, 'B2').click();
  await seat(page, 'N21').click();
  await expect(page.locator('.pv-sheet h1')).toHaveText('Row N · Seat 21');
  await expectCameraAt(page, 'N21');
});
