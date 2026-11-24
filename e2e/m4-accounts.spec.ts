import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PASSWORD, mailLink, registerVerified, signIn, uniqueEmail } from './support/accounts';

/**
 * M4 against the end-to-end backend: PostgreSQL (seatview_test) and the development mail outbox.
 * Showtime imports and alerts need an admin, so journey B runs in acceptance.spec.ts after M5.
 */
const dir = 'docs/screenshots/M4';
mkdirSync(dir, { recursive: true });
const size = (name: string) => (name.includes('desktop') ? '1440' : '390');

test('registration needs a confirmed email; reset signs out everywhere', async ({ page, browser }, info) => {
  const email = uniqueEmail('reset');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.locator('form.dx-form').first().getByLabel('Name', { exact: true }).fill('Reset Tester');
  await page.locator('form.dx-form').first().getByLabel('Email', { exact: true }).fill(email);
  await page.locator('form.dx-form').first().getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('[data-verify=pending]')).toContainText('Confirm your email');
  // Unconfirmed accounts get no save stars.
  await page.goto('/movies?city=chennai');
  await expect(page.locator('.dx-fav')).toHaveCount(0);
  await page.goto(await mailLink(page.request, email, 'verify'));
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
  await page.goto('/movies?city=chennai');
  await expect(page.locator('.dx-fav').first()).toBeVisible();

  // A second session, then a password reset from the first: both are signed out.
  const other = await browser.newContext({ ...info.project.use });
  const second = await other.newPage();
  await signIn(second, email);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.locator('form.dx-form').first().getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/a reset link is on its way/)).toBeVisible();
  await page.goto(await mailLink(page.request, email, 'reset'));
  await page.getByLabel('New password').fill('a-brand-new-pass');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText(/signed out everywhere/)).toBeVisible();
  await second.reload();
  await expect(second.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await signIn(page, email, 'a-brand-new-pass');
  await other.close();
});

test('failure: an expired or tampered session falls back to signed out', async ({ page, context }) => {
  const email = uniqueEmail('expiry');
  await registerVerified(page, 'Expiry Tester', email);
  await context.addCookies([{ name: 'sv_session', value: 'tampered-or-expired', url: page.url() }]);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect((await page.request.get('/api/me/library')).status()).toBe(401);
});

test('profile, home city and languages persist in PostgreSQL across sessions; a temporary city leaves home alone', async ({ page, browser }, info) => {
  const email = uniqueEmail('persist');
  await registerVerified(page, 'Persist Tester', email);
  await page.goto('/profile');
  await page.getByLabel('Home city').selectOption('chennai');
  await page.getByLabel('Tamil').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.dx-ok')).toHaveText('Saved.');
  await expect(page.getByLabel('Email me reminders')).toBeDisabled();
  await page.goto('/movies?city=chennai');
  await page.getByRole('button', { name: /Add PVR Palazzo.* to favourites/ }).click();
  await page.getByRole('button', { name: /Save show:/ }).first().click();

  const other = await browser.newContext({ ...info.project.use });
  const second = await other.newPage();
  await signIn(second, email);
  await second.goto('/profile');
  await expect(second.getByLabel('Home city')).toHaveValue('chennai');
  await expect(second.getByLabel('Tamil')).toBeChecked();
  await expect(second.locator('.dx-savedrow')).toHaveCount(1);
  await expect(second.getByRole('link', { name: /^PVR Palazzo/ })).toBeVisible();
  await second.goto('/movies?city=mumbai');
  await expect(second.getByText('Browsing Mumbai')).toBeVisible();
  expect((await (await second.request.get('/api/me')).json()).user.homeCity).toBe('chennai');
  await second.goto('/profile');
  await second.screenshot({ path: `${dir}/profile-saved-${size(info.project.name)}.png`, fullPage: true });
  await other.close();
});

test('demo tickets, saved shows and provider bookings look different', async ({ page }, info) => {
  const email = uniqueEmail('kinds');
  await registerVerified(page, 'Kinds Tester', email);
  await page.goto('/movies?city=chennai');
  await page.getByRole('button', { name: /Save show:/ }).first().click();
  await page.goto('/profile');
  await expect(page.locator('.dx-savedrow h3').first()).toBeVisible();
  const savedLabel = await page.locator('.dx-savedrow h3').first().evaluate((el) => getComputedStyle(el, '::before').content);
  expect(savedLabel).toContain('Saved show');
  await expect(page.getByRole('heading', { name: /Demo tickets/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confirmed bookings' })).toBeVisible();
  await expect(page.getByText(/provider’s confirmation is your ticket/)).toBeVisible();
  await page.screenshot({ path: `${dir}/kinds-${size(info.project.name)}.png`, fullPage: true });
});
