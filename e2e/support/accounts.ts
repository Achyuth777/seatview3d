import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Shared helpers for journeys that need the end-to-end backend (FEED_PROVIDER=fixture, DEV_OUTBOX=true). */
export const FEED_FILE = '.e2e-data/feed.json';
export const PASSWORD = 'correct-horse-1';
export const uniqueEmail = (tag: string) => `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;

/** Writes the SIMULATED provider's answer for the next import. */
export function setFeed(data: { fail?: boolean | string; cinemas?: Record<string, unknown[]> }) {
  writeFileSync(FEED_FILE, JSON.stringify({ fail: false, cinemas: {}, ...data }));
}

/** Today's Asia/Kolkata date and a time later today, so the fixture show is upcoming. */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Reads the newest simulated email of a kind for a test address and returns its link path. */
export async function mailLink(request: APIRequestContext, to: string, kind: 'verify' | 'reset'): Promise<string> {
  let link = '';
  await expect.poll(async () => {
    const rows = (await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(to)}`)).json()) as { kind: string; body: string }[];
    const body = rows.find((r) => r.kind === kind)?.body ?? '';
    link = /https?:\/\/[^/]+(\/[^\s]+)/.exec(body)?.[1] ?? '';
    return link;
  }).not.toBe('');
  return link;
}

/** Registers through the UI and confirms the email through the emailed link. */
export async function registerVerified(page: Page, name: string, email: string) {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.locator('form.dx-form').first().getByLabel('Name', { exact: true }).fill(name);
  await page.locator('form.dx-form').first().getByLabel('Email', { exact: true }).fill(email);
  await page.locator('form.dx-form').first().getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('[data-verify=pending]')).toBeVisible();
  await page.goto(await mailLink(page.request, email, 'verify'));
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/profile');
  await page.locator('form.dx-form').first().getByLabel('Email', { exact: true }).fill(email);
  await page.locator('form.dx-form').first().getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/Signed in as/)).toBeVisible();
}

/** First-admin setup, exactly as the owner runs it (server CLI with the database settings). */
export function grantAdmin(email: string, revoke = false) {
  execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/grantAdmin.ts', email, ...(revoke ? ['--revoke'] : [])], {
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
    stdio: 'pipe',
  });
}
