import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** M2 discovery. E2E_BASE_URL: full backend. OUTAGE_URL (optional): same build with /api cut off. */
const dir = 'docs/screenshots/M2';
mkdirSync(dir, { recursive: true });
const size = (name: string) => (name.includes('desktop') ? '1440' : '390');
const inViewport = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
});

test('opening screen leads to two destinations, demo kept apart', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find a cinema' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Explore the seat view/ })).toBeVisible();
  expect(await inViewport(page, '.lp-find__title')).toBe(true);
  if (size(info.project.name) === '1440') expect(await inViewport(page, '.lp-explore__title')).toBe(true);
  // City, search and the first real cinema are reachable on the first screen.
  expect(await inViewport(page, '.lp-find .search')).toBe(true);
  expect(await inViewport(page, '.lp-find .dx-cinema')).toBe(true);
  const demo = page.locator('section[aria-labelledby=demo-title]');
  await expect(demo.getByRole('heading', { level: 2 })).toHaveText(/^Demo/);
  await expect(demo).toContainText('Kalki 2898 AD');
  await expect(page.locator('.lp-find')).not.toContainText('Kalki');
  await page.screenshot({ path: `${dir}/landing-${size(info.project.name)}.png` });
  await page.getByRole('link', { name: /Explore the seat view/ }).click();
  await expect(page).toHaveURL(/\/preview\/demo-hall-chennai-1/);
});

test('journey A: Forum Mall to Palazzo, provider link, search restored on return', async ({ page, context }, info) => {
  await page.goto('/');
  await page.locator('.lp-find').getByRole('button', { name: 'Chennai' }).click();
  await page.locator('.lp-find input[type=search]').fill('Forum Mall');
  const row = page.locator('.lp-find .dx-cinema').first();
  await expect(row).toContainText('PVR Palazzo');
  await expect(row).toContainText('Vadapalani');
  await expect(row.getByRole('link', { name: /Check showtimes/ })).toHaveAttribute('href', 'https://www.district.in/movies/pvr-palazzo-the-nexus-vijaya-mall-chennai-CD1022274');

  await page.getByRole('link', { name: /All films and cinemas in Chennai/ }).click();
  await expect(page.locator('#dx-q')).toHaveValue('Forum Mall');
  const provider = page.locator('.dx-main a[target=_blank]').first();
  await expect(provider).toHaveAttribute('href', /district\.in\/movies\/pvr-palazzo/);
  // The provider opens in a new tab; record that the visitor went there, without loading the provider site.
  await context.route('https://www.district.in/**', (r) => r.fulfill({ body: 'provider page (stubbed in tests)' }));
  const popup = context.waitForEvent('page');
  await provider.click();
  await (await popup).close();

  await page.goto('about:blank');
  await page.goto('/movies?city=chennai');
  await expect(page.locator('#dx-q')).toHaveValue('Forum Mall');
  await expect(page.getByText('Showing your last search')).toBeVisible();
  await expect(page.locator('.dx-main')).toContainText('PVR Palazzo');
  await page.screenshot({ path: `${dir}/journey-a-restored-${size(info.project.name)}.png` });
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#dx-q')).toHaveValue('');
});

test('mobile: city and search dock in the thumb zone on Movies', async ({ page }, info) => {
  test.skip(size(info.project.name) !== '390', 'phone layout only');
  await page.goto('/movies?city=chennai');
  const dock = await page.locator('.dx-search').boundingBox();
  const vh = page.viewportSize()!.height;
  expect(dock!.y).toBeGreaterThan(vh * 0.8);
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(vh);
  await page.locator('.dx-search select').selectOption('kochi');
  await expect(page.locator('.dx-main')).toContainText('PVR Lulu');
  await page.locator('#dx-q').fill('Lulu');
  await expect(page.locator('.dx-main')).toContainText('Edappally');
  await page.screenshot({ path: `${dir}/movies-dock-390.png` });
});

test('Back restores scroll position and the focused cinema', async ({ page }) => {
  await page.goto('/movies?city=chennai');
  const link = page.locator('[data-restore-key="cinema:chn-pvr-vr"]');
  await link.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  const y = await page.evaluate(() => window.scrollY);
  await link.click();
  await expect(page).toHaveURL(/\/cinema\/chn-pvr-vr/);
  await page.goBack();
  await expect(page).toHaveURL(/\/movies\?city=chennai/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-restore-key'))).toBe('cinema:chn-pvr-vr');
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(40);
});

test('sports routes, deep links and Back keep working', async ({ page }) => {
  await page.goto('/cricket?city=chennai');
  await expect(page.locator('.chart__row').first()).toBeVisible();
  await page.locator('.chart__title').first().click();
  await expect(page).toHaveURL(/\/event\/csk-vs-mi/);
  await page.goBack();
  await expect(page).toHaveURL(/\/cricket/);
  await page.goto('/book/cricket-odi?seat=101-10-11&instant=1');
  await expect(page.locator('.seat')).toContainText('101', { timeout: 20_000 });
  await page.goto('/?venue=stadium');
  await expect(page).toHaveURL(/\/book\/sta-match/);
  for (const p of ['/football', '/basketball?city=mumbai', '/event/lal-vs-gsw']) {
    await page.goto(p);
    await expect(page.locator('.chart__row').first()).toBeVisible();
  }
});

test('failure: slow discovery response shows loading, then results', async ({ page }) => {
  await page.route('**/api/discovery**', async (r) => { await new Promise((res) => setTimeout(res, 2500)); await r.continue(); });
  await page.goto('/movies?city=hyderabad');
  await expect(page.getByText('Loading Hyderabad…')).toBeVisible();
  await expect(page.locator('.dx-main')).toContainText('PVR Atrium', { timeout: 15_000 });
});

test('failure: booking page during a backend outage has no uncaught error', async ({ page }) => {
  const outage = process.env.OUTAGE_URL;
  test.skip(!outage, 'needs OUTAGE_URL');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${outage}/book/cin-2145?seat=H5&instant=1`);
  await expect(page.getByText(/Can’t reach the booking server/)).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
