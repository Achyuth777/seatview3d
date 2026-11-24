import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { adminSignIn } from './support/admin';
import { grantAdmin, istToday, registerVerified, setFeed, signIn, uniqueEmail } from './support/accounts';

/**
 * Acceptance journeys A, B and C, end to end, against PostgreSQL with the SIMULATED fixture provider and the
 * development outbox. Run with --project chromium-desktop / chromium-mobile / webkit-mobile.
 */
const dir = 'docs/screenshots/acceptance';
mkdirSync(dir, { recursive: true });
test.describe.configure({ mode: 'serial' });
const tag = (info: TestInfo) => info.project.name;
const PALAZZO = 'https://www.district.in/movies/pvr-palazzo-the-nexus-vijaya-mall-chennai-CD1022274';
const show = (key: string, time: string) => ({ externalKey: key, externalFilmId: 'acc', title: 'Acceptance Film', posterUrl: null, localStart: `${istToday()}T${time}`, language: 'Tamil', format: '2D', providerUrl: null });
const newPage = async (browser: Browser, info: TestInfo, extra: object = {}) => (await browser.newContext({ ...info.project.use, ...extra })).newPage();

async function journeyA(page: Page, info: TestInfo, label: string) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  const find = page.locator('.lp-find');
  await find.getByRole('button', { name: 'Chennai' }).click();
  await find.getByRole('searchbox').fill('Forum Mall');
  const row = find.locator('.dx-cinema').first();
  await expect(row).toContainText('PVR Palazzo');
  await expect(row).toContainText('Vadapalani');
  await expect(row.getByRole('link', { name: /Check showtimes/ })).toHaveAttribute('href', PALAZZO);
  await page.getByRole('link', { name: /All films and cinemas in Chennai/ }).click();
  await expect(page.locator('#dx-q')).toHaveValue('Forum Mall');
  await page.goto('about:blank');
  await page.goto('/movies?city=chennai');
  await expect(page.locator('#dx-q')).toHaveValue('Forum Mall');
  await expect(page.getByText('Showing your last search')).toBeVisible();
  await page.screenshot({ path: `${dir}/A-${label}-${tag(info)}.png` });
}

test('A: Forum Mall → Palazzo → provider link; search restored on return', async ({ page }, info) => {
  await journeyA(page, info, 'pointer');
});

test('A with reduced motion, plus the seat view switching instantly', async ({ browser }, info) => {
  const page = await newPage(browser, info, { reducedMotion: 'reduce' });
  await journeyA(page, info, 'reduced-motion');
  await page.goto('/preview/demo-hall-chennai-1');
  await page.locator('[data-seat="K12"]').click();
  await expect(page.locator('.pv-sheet h1')).toHaveText('Row K · Seat 12');
  await expect(page.locator('.pv-stage__label--still')).toBeVisible();
  await page.context().close();
});

test('A keyboard-only', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop', 'keyboard run on desktop Chromium');
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  const focusTo = async (match: (el: { text: string; tag: string; label: string; cls: string }) => boolean, max = 40) => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      const el = await page.evaluate(() => { const a = document.activeElement as HTMLElement; return { text: a.textContent?.trim() ?? '', tag: a.tagName, label: a.getAttribute('aria-label') ?? '', cls: a.className }; });
      if (match(el)) return el;
    }
    throw new Error('focus target not reached');
  };
  await focusTo((e) => e.tag === 'BUTTON' && e.text === 'Chennai');
  await page.keyboard.press('Enter');
  await focusTo((e) => e.tag === 'INPUT');
  await page.keyboard.type('Forum Mall');
  await focusTo((e) => e.tag === 'A' && e.text.startsWith('Check showtimes'));
  const focused = await page.evaluate(() => { const a = document.activeElement as HTMLAnchorElement; return { href: a.href, outline: getComputedStyle(a).outlineStyle }; });
  expect(focused.href).toBe(PALAZZO);
  expect(focused.outline).not.toBe('none');
  await page.screenshot({ path: `${dir}/A-keyboard-${tag(info)}.png` });
});

test('B and C: admin imports and corrects; verified user saves, sees it in a second session, gets exactly one update; regular user denied', async ({ page, browser }, info) => {
  const extId = `palazzo-${info.project.name}`;
  // Admin (two-step sign-in) maps Palazzo to the simulated provider and imports today's shows.
  const adminEmail = uniqueEmail('accadmin');
  await registerVerified(page, 'Acceptance Admin', adminEmail);
  grantAdmin(adminEmail);
  await adminSignIn(page, adminEmail);
  await page.goto('/admin#cinemas');
  const card = page.locator('[data-cinema="chn-pvr-palazzo"]');
  await card.locator('summary').click();
  await card.getByLabel(/Provider cinema ID/).fill(extId);
  await card.getByRole('button', { name: 'Save ID' }).click();
  await expect(page.locator('[aria-live] .dx-ok')).toContainText('Provider cinema ID saved');
  setFeed({ cinemas: { [extId]: [show(`${extId}-1`, '23:10'), show(`${extId}-2`, '23:20')] } });
  await page.goto('/admin#feeds');
  const chennai = page.locator('.ad-feed[data-city=chennai]');
  await chennai.getByRole('button').click();
  await expect(page.locator('[aria-live] .dx-ok')).toContainText('Imported 2 showtimes');

  // B: a verified user saves the 11:10 pm show.
  const userEmail = uniqueEmail('accuser');
  const user = await newPage(browser, info);
  await registerVerified(user, 'Acceptance User', userEmail);
  await user.goto('/movies?city=chennai');
  const film = user.locator('.dx-film', { hasText: 'Acceptance Film' }).first();
  await film.getByRole('button', { name: /Save show:.*11:10 pm/ }).click();
  await expect(film.getByRole('button', { name: /Remove saved show:.*11:10 pm/ })).toBeVisible();

  // ...and sees it from a second session.
  const second = await newPage(browser, info);
  await signIn(second, userEmail);
  await second.goto('/profile');
  await expect(second.locator('.dx-savedrow', { hasText: 'Acceptance Film' })).toContainText('11:10 pm');

  // The provider moves the show; the admin imports twice (the same change), plus one outage in between.
  setFeed({ cinemas: { [extId]: [show(`${extId}-1`, '23:40'), show(`${extId}-2`, '23:20')] } });
  await chennai.getByRole('button').click();
  await expect(page.locator('[aria-live] .dx-ok')).toContainText('Imported 2 showtimes');
  setFeed({ fail: 'Simulated provider outage (HTTP 503)' });
  await chennai.getByRole('button').click();
  await expect(page.locator('[aria-live] .dx-error')).toContainText('Simulated provider outage');
  setFeed({ cinemas: { [extId]: [show(`${extId}-1`, '23:40'), show(`${extId}-2`, '23:20')] } });
  await chennai.getByRole('button').click();
  await expect(page.locator('[aria-live] .dx-ok')).toContainText('Imported 2 showtimes');

  await second.goto('/profile');
  const updates = second.locator('.dx-alert');
  await expect(updates).toHaveCount(1);
  await expect(updates).toContainText('moved from');
  await expect(updates.locator('s')).toContainText('11:10 pm');
  await expect(updates.locator('strong')).toContainText('11:40 pm');
  await expect(updates.getByRole('link', { name: 'See other shows here' })).toHaveAttribute('href', '/cinema/chn-pvr-palazzo');
  await second.screenshot({ path: `${dir}/B-update-${tag(info)}.png`, fullPage: true });
  // Delivered exactly once: no other session or later request receives it again.
  expect((await (await user.request.post('/api/me/alerts/deliver')).json()).alerts).toEqual([]);
  await user.goto('/profile');
  await expect(user.locator('.dx-alert')).toHaveCount(0);
  await expect(user.locator('.dx-savedrow', { hasText: 'Acceptance Film' })).toContainText('Changed');

  // C: the admin corrects the venue, retries the import, and the correction persists and reaches a visitor.
  const name = `PVR Palazzo ${info.project.name}`;
  await page.goto('/admin#cinemas');
  await card.locator('summary').click();
  await card.getByLabel('Name').fill(name);
  await card.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.locator('[aria-live] .dx-ok')).toContainText('survives imports');
  await page.goto('/admin#feeds');
  await chennai.getByRole('button').click();
  await expect(page.locator('[aria-live] .dx-ok')).toContainText('Imported');
  const visitor = await newPage(browser, info);
  await visitor.goto('/movies?city=chennai');
  await expect(visitor.locator('.dx-main')).toContainText(name);
  await visitor.goto('/cinema/chn-pvr-palazzo');
  await expect(visitor.locator('h1')).toHaveText(name);
  await visitor.screenshot({ path: `${dir}/C-visitor-${tag(info)}.png` });

  // A regular (verified) user attempting the same admin operations is denied by the server.
  for (const [method, url, data] of [
    ['patch', '/api/admin/cinemas/chn-pvr-palazzo', { name: 'Not allowed' }],
    ['post', '/api/admin/refresh/chennai', undefined],
  ] as const) {
    expect((await user.request.fetch(url, { method, data })).status(), `${method} ${url}`).toBe(403);
  }
  await expect(visitor.locator('h1')).toHaveText(name);
});
