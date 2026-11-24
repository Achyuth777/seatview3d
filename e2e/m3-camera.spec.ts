import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

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

// Video is recorded for the camera journey.
test.use({ video: 'on' });

test('one update: map, camera and labels; three rapid picks end on the last', async ({ page }, info) => {
  await page.goto(PREVIEW);
  await expect(page.locator('.pv-prov')).toContainText('Illustrative demo');
  await expect(stage(page)).toHaveAttribute('data-camera-seat', 'overview', { timeout: 20_000 });
  await page.screenshot({ path: `${dir}/overview-${size(info.project.name)}.png` });

  await seat(page, 'F5').click();
  await expect(seat(page, 'F5')).toHaveAttribute('data-state', 'view');
  await expect(page.locator('.pv-sheet h1')).toHaveText('Row F · Seat 5');
  await expect(stage(page)).toHaveAttribute('data-target-seat', 'F5');
  await expect(page.locator('[data-fig=angle] dd')).toHaveText(/°$/);
  await expectCameraAt(page, 'F5');

  // Three seats in quick succession: the camera and labels must finish on the last one.
  await seat(page, 'A3').click();
  await seat(page, 'H10').click();
  await seat(page, 'O20').click();
  await expect(page.locator('.pv-sheet h1')).toHaveText('Row O · Seat 20');
  await expect(page.locator('.pv-stage__label')).toContainText('Row O · Seat 20');
  await expectCameraAt(page, 'O20');
  await expect(page.locator('[data-state=view]')).toHaveCount(1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/selected-${size(info.project.name)}.png` });
  await page.close();
  copyFileSync(await page.video()!.path(), `${dir}/rapid-selection-${size(info.project.name)}.webm`);
});
