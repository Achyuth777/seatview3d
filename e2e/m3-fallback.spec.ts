import { expect, test } from '@playwright/test';

// A browser with WebGL switched off, as on some locked-down or very old devices.
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] } });

test('without WebGL the preview falls back to a usable 2D view', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'the switches are Chromium flags');
  await page.goto('/preview/demo-hall-chennai-1?seat=K12');
  await expect(page.locator('.pv-stage')).toHaveAttribute('data-renderer', '2d');
  await expect(page.getByText('3D isn’t available on this device')).toBeVisible();
  await expect(page.locator('.pv-section')).toHaveAttribute('aria-label', /row K/);
  await page.locator('[data-seat="C4"]').click();
  await expect(page.locator('.pv-sheet h1')).toHaveText('Row C · Seat 4');
  await expect(page.locator('.pv-section')).toHaveAttribute('aria-label', /row C/);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: `docs/screenshots/M3/fallback-${info.project.name.includes('desktop') ? '1440' : '390'}.png` });
});
