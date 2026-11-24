import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against servers started outside Playwright (see e2e/README.md), so the same specs can target
 * the full backend, a frontend-only build, or a backend outage. URLs come from the environment.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } },
  ],
});
