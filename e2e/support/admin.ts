import { expect, type Page } from '@playwright/test';
import { totpAt } from '../../server/platform/totp';
import { PASSWORD } from './accounts';

/** TOTP secrets of test admins, so later sessions can produce codes like an authenticator app. */
const secrets = new Map<string, string>();
export const codeFor = (email: string) => totpAt(secrets.get(email)!, Math.floor(Date.now() / 30_000));

/** Signs in on the admin entry point and passes two-step sign-in (enrolling the first time). */
export async function adminSignIn(page: Page, email: string) {
  await page.goto('/admin');
  const signInHeading = page.getByRole('heading', { name: 'Admin sign-in' });
  const mfaHeading = page.getByRole('heading', { name: 'Two-step sign-in' });
  const workspace = page.getByRole('navigation', { name: 'Admin sections' });
  // Already signed in on the site: straight to the second step. Already verified in this session: straight in.
  await expect(signInHeading.or(mfaHeading).or(workspace)).toBeVisible();
  if (await workspace.isVisible()) return;
  if (await signInHeading.isVisible()) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(mfaHeading).toBeVisible();
  const setup = page.getByRole('button', { name: 'Set up two-step sign-in' });
  if (await setup.isVisible()) {
    await setup.click();
    secrets.set(email, (await page.locator('[data-totp-secret]').getAttribute('data-totp-secret'))!);
  }
  await page.getByLabel('6-digit code').fill(codeFor(email));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
}
