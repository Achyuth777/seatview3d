import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * M1 baseline: screenshots and a feature matrix per mode. MODE is "full", "frontend-only" or "outage";
 * E2E_BASE_URL points at the matching server. Read-only: it creates no accounts or bookings.
 */
const mode = process.env.MODE ?? 'full';
const dir = 'docs/screenshots/M1';
mkdirSync(dir, { recursive: true });
const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `${dir}/${mode}-${name}-${project.includes('desktop') ? '1440' : '390'}.png`, fullPage: false });

test('baseline pages and feature matrix', async ({ page }, info) => {
  test.skip(!process.env.MODE, 'records the M1 starting state; run with MODE=full|frontend-only|outage');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const matrix: Record<string, string> = {};
  const note = (k: string, ok: boolean, detail = '') => { matrix[k] = `${ok ? 'works' : 'fails'}${detail ? ` (${detail})` : ''}`; };

  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await shot(page, 'home', info.project.name);
  note('landing', true);

  await page.goto('/movies?city=chennai');
  await page.waitForTimeout(800);
  const body = await page.locator('main').innerText();
  note('discovery: real cinemas', body.includes('PVR Palazzo'));
  note('discovery: backend status', true, body.includes('Can’t reach') ? 'shows temporary outage' : body.includes('No live showtime feed') ? 'directory, no live feed' : 'other');
  await page.locator('#dx-q').fill('Forum Mall');
  await page.waitForTimeout(300);
  note('search Forum Mall -> Palazzo', (await page.locator('main').innerText()).includes('Vadapalani'));

  await page.goto('/cinema/chn-pvr-palazzo');
  await expect(page.locator('h1')).toHaveText('PVR Palazzo');
  await shot(page, 'cinema', info.project.name);
  note('cinema detail + provider link', (await page.locator('a[target=_blank]').first().getAttribute('href'))?.includes('district.in') ?? false);

  await page.goto('/preview/demo-hall-chennai-1?seat=K12&instant=1');
  await page.waitForTimeout(2500);
  await shot(page, 'seat-preview', info.project.name);
  note('seat preview (3D)', (await page.locator('canvas').count()) === 1 && (await page.locator('.seat').innerText()).includes('K12'));

  await page.goto('/profile');
  await page.waitForTimeout(1000);
  await shot(page, 'profile', info.project.name);
  const profile = await page.locator('main').innerText();
  note('accounts', profile.includes('Sign in'), profile.includes('runs without') ? 'off: frontend-only build' : profile.includes('temporarily') ? 'temporarily unavailable' : 'sign-in offered');

  await page.goto('/book/cin-2145?seat=H5&instant=1');
  await page.waitForTimeout(2000);
  note('demo booking view', (await page.locator('.actions').count()) > 0);

  for (const p of ['/cricket', '/football', '/basketball', '/event/csk-vs-mi']) {
    await page.goto(p);
    note(`sports ${p}`, (await page.locator('.chart__row').count()) > 0 || p !== '/basketball');
  }
  note('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  info.annotations.push({ type: 'matrix', description: JSON.stringify(matrix) });
  console.log(`MATRIX ${mode} ${info.project.name} ${JSON.stringify(matrix)}`);
});
