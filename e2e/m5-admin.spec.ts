import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { adminSignIn } from './support/admin';
import { grantAdmin, istToday, registerVerified, setFeed, uniqueEmail } from './support/accounts';

/** M5 against the end-to-end backend with ADMIN_MFA_REQUIRED=true and the SIMULATED fixture provider. */
const dir = 'docs/screenshots/M5';
mkdirSync(dir, { recursive: true });
const size = (name: string) => (name.includes('desktop') ? '1440' : '390');
test.describe.configure({ mode: 'serial' });

async function openCinema(page: Page, id: string) {
  await page.goto('/admin#cinemas');
  const card = page.locator(`[data-cinema="${id}"]`);
  await card.locator('summary').click();
  return card;
}

test('a regular user is refused by the server and sees no admin tools', async ({ page }) => {
  const email = uniqueEmail('regular');
  await registerVerified(page, 'Regular User', email);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'No admin access' })).toBeVisible();
  for (const [method, url, data] of [
    ['get', '/api/admin/overview', undefined], ['patch', '/api/admin/cinemas/chn-pvr-palazzo', { name: 'Hijacked' }],
    ['post', '/api/admin/refresh/chennai', undefined], ['put', '/api/admin/cinemas/chn-pvr-palazzo/provider-link', { url: 'https://evil.example' }],
  ] as const) {
    const res = await page.request.fetch(url, { method, data });
    expect(res.status(), `${method} ${url}`).toBe(403);
  }
});

test('admin: separate entry point, two-step sign-in, sections; correction reaches an open visitor page and the audit log', async ({ page, browser }, info) => {
  const email = uniqueEmail('admin');
  await registerVerified(page, 'Admin Person', email);
  grantAdmin(email);
  await adminSignIn(page, email);
  await expect(page.locator('.strip__nav')).toHaveCount(0); // not the public site's header
  for (const s of ['Feeds', 'Cinemas', 'Layouts', 'Activity', 'Mail']) await expect(page.getByRole('link', { name: s, exact: true })).toBeVisible();
  await page.screenshot({ path: `${dir}/feeds-${size(info.project.name)}.png`, fullPage: true });

  // A visitor already has the cinema open.
  const visitorCtx = await browser.newContext({ ...info.project.use });
  const visitor = await visitorCtx.newPage();
  await visitor.goto('/movies?city=chennai');
  await expect(visitor.locator('.dx-main')).toContainText('PVR Palazzo');
  await visitor.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });

  const name = `PVR Palazzo ${info.project.name.includes('desktop') ? 'Vadapalani' : 'Vijaya'}`;
  const card = await openCinema(page, 'chn-pvr-palazzo');
  await card.getByLabel('Name').fill(name);
  await card.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText(`${name} saved.`)).toBeVisible();
  const editedAt = Date.now();

  // Freshness window: 30 s polling while visible, or immediately on focus. No reload happens.
  await expect(visitor.locator('.dx-main')).toContainText(name, { timeout: 35_000 });
  const seconds = Math.round((Date.now() - editedAt) / 1000);
  expect(await visitor.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  console.log(`FRESHNESS visitor saw the correction after ${seconds}s without reloading`);
  await visitor.screenshot({ path: `${dir}/visitor-sees-correction-${size(info.project.name)}.png` });
  await visitorCtx.close();

  await page.goto('/admin#activity');
  const row = page.locator('[data-audit=correct]').first();
  await expect(row).toContainText(email);
  await expect(row).toContainText('chn-pvr-palazzo');
  await page.screenshot({ path: `${dir}/audit-${size(info.project.name)}.png` });

  // Provider link fix and layout verification.
  const card2 = await openCinema(page, 'chn-pvr-palazzo');
  await card2.getByLabel('Provider link', { exact: true }).fill('https://www.district.in/movies/pvr-palazzo-the-nexus-vijaya-mall-chennai-CD1022274');
  await card2.getByRole('button', { name: 'Save link' }).click();
  await expect(page.getByText('Provider link saved.')).toBeVisible();
  await page.goto('/admin#layouts');
  const form = page.getByRole('form', { name: 'Map or verify an auditorium' });
  await form.getByLabel('Cinema').selectOption('chn-pvr-palazzo');
  await form.getByLabel('Auditorium name').fill('Screen 5');
  await form.getByLabel('3D model').selectOption('verified');
  await form.getByLabel(/Measurement source/).fill('Owner-supplied drawings, rev B');
  await form.getByLabel('Measured on').fill('2026-11-20');
  await form.getByRole('button', { name: 'Save auditorium' }).click();
  await expect(page.locator('[data-auditorium="chn-pvr-palazzo-screen-5"]')).toContainText('verified');
  await expect(page.getByText(/Owner-supplied drawings, rev B \(measured 2026-11-20\)/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${dir}/layouts-${size(info.project.name)}.png`, fullPage: true });
});

test('failed sync and retry: last success shown apart from the latest failure; correction kept', async ({ page }, info) => {
  const email = uniqueEmail('syncadmin');
  await registerVerified(page, 'Sync Admin', email);
  grantAdmin(email);
  await adminSignIn(page, email);
  const card = await openCinema(page, 'chn-pvr-escape');
  await card.getByLabel(/Provider cinema ID/).fill('escape-1');
  await card.getByRole('button', { name: 'Save ID' }).click();
  await card.getByLabel('Name').fill('PVR Escape EA');
  await card.getByRole('button', { name: 'Save correction' }).click();

  const today = istToday();
  setFeed({ fail: 'Simulated provider outage (HTTP 503)' });
  await page.goto('/admin#feeds');
  const feed = page.locator('.ad-feed[data-city=chennai]');
  await feed.getByRole('button', { name: /Run import|Retry failed sync/ }).click();
  await expect(feed).toContainText('Failed: Simulated provider outage (HTTP 503)');
  await expect(page.locator('[aria-live] .dx-error')).toContainText('Chennai: Simulated provider outage');
  await expect(feed.locator('[data-k=failure]')).not.toHaveText('none');
  await page.screenshot({ path: `${dir}/failed-sync-${size(info.project.name)}.png` });

  setFeed({ cinemas: { 'escape-1': [{ externalKey: 'e1', externalFilmId: 'f1', title: 'Feed Fixture Film', posterUrl: null, localStart: `${today}T23:40`, language: 'Tamil', format: '2D', providerUrl: null }] } });
  await feed.getByRole('button', { name: 'Retry failed sync' }).click();
  await expect(page.locator('[aria-live] .dx-ok')).toContainText('Imported 1 showtimes');
  await expect(feed.locator('[data-k=success]')).not.toHaveText('never');
  await expect(feed.locator('[data-k=failure]')).not.toHaveText('none'); // still shown, separately
  const overview = await (await page.request.get('/api/admin/overview')).json();
  expect(overview.cinemas.find((c: { id: string }) => c.id === 'chn-pvr-escape').name).toBe('PVR Escape EA');
});

test('losing the admin role or signing out removes access immediately', async ({ page }) => {
  const email = uniqueEmail('revoke');
  await registerVerified(page, 'Revoke Admin', email);
  grantAdmin(email);
  await adminSignIn(page, email);
  await page.goto('/admin#feeds');
  grantAdmin(email, true);
  await page.locator('.ad-feed[data-city=hyderabad]').getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'No admin access' })).toBeVisible();
  expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
  grantAdmin(email);
  await adminSignIn(page, email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Admin sign-in' })).toBeVisible();
  expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
});
