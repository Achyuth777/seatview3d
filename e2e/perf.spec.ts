import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { lowPowerProfile, measureLcp, readInp, watchInteractions } from './support/perf';

/**
 * Before/after numbers on one device profile (Chromium, 390x844, 4x CPU, throttled network).
 * PERF_LABEL names the output file in docs/perf/. Run with --project=chromium-mobile.
 */
const label = process.env.PERF_LABEL ?? 'run';
test.skip(!process.env.PERF_LABEL, 'performance runs only when PERF_LABEL is set');
const results: Record<string, unknown> = { label, profile: 'Chromium 390x844, 4x CPU slowdown, 150 ms RTT, 1.6 Mbps down', at: new Date().toISOString() };

test.afterAll(() => {
  mkdirSync('docs/perf', { recursive: true });
  writeFileSync(`docs/perf/${label}.json`, JSON.stringify(results, null, 2));
});

for (const [name, path] of [['landing', '/'], ['discovery', '/movies?city=chennai']] as const) {
  test(`LCP ${name}`, async ({ browser }, info) => {
    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      // A fresh context per run: empty cache, like a first visit.
      const context = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
      const page = await context.newPage();
      await lowPowerProfile(page);
      await page.goto(path, { waitUntil: 'load' });
      runs.push(await measureLcp(page));
      await context.close();
    }
    runs.sort((a, b) => a - b);
    results[`lcp_${name}_ms`] = { median: runs[1], runs };
    expect(runs[1]).toBeGreaterThan(0);
  });
}

test('seat selection INP', async ({ page }) => {
  await page.goto(process.env.PERF_SEAT_PATH ?? '/preview/demo-hall-chennai-1?instant=1');
  await page.waitForTimeout(2500);
  await lowPowerProfile(page);
  await watchInteractions(page);
  const target = process.env.PERF_SEAT_SELECTOR;
  let picks = 0;
  if (target) {
    // A seat control that exists in the page (the 2D seat map after M3).
    for (const id of ['F5', 'K12', 'O20', 'C3', 'H9']) {
      const el = page.locator(target.replace('{id}', id)).first();
      if (await el.count()) { await el.click(); picks++; await page.waitForTimeout(700); }
    }
  } else {
    // Before M3 the only way to pick a seat is clicking a seat in the 3D canvas from the overview.
    const box = (await page.locator('canvas').boundingBox())!;
    for (let y = box.y + box.height * 0.35; y < box.y + box.height * 0.8 && picks < 5; y += 24) {
      for (let x = box.x + 30; x < box.x + box.width - 30 && picks < 5; x += 40) {
        const before = new URL(page.url()).searchParams.get('seat');
        await page.mouse.click(x, y);
        await page.waitForTimeout(250);
        const after = new URL(page.url()).searchParams.get('seat');
        if (after && after !== before) {
          picks++;
          await page.waitForTimeout(500);
          await page.getByRole('button', { name: /Back to overview/ }).click();
          await page.waitForTimeout(900);
        }
      }
    }
  }
  const { inp, count } = await readInp(page);
  results.seat_selection = { inp_ms: inp, interactions: count, seats_selected: picks, method: target ? '2D seat map' : '3D canvas click' };
  expect(picks).toBeGreaterThan(0);
});
