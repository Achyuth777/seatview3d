import type { Page } from '@playwright/test';

/** The low-power mobile profile used for every before/after number: 4x CPU slowdown, fast-3G-like network. */
export async function lowPowerProfile(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  return cdp;
}

/** Largest Contentful Paint in ms, read after the page settles. */
export async function measureLcp(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve) => {
    let lcp = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) lcp = Math.max(lcp, e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => resolve(Math.round(lcp)), 3000);
  }));
}

/** Starts collecting Event Timing entries; read with readInteractions(). */
export async function watchInteractions(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __inp: number[] };
    w.__inp = [];
    const byId = new Map<number, number>();
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEventTiming[]) {
        if (!e.interactionId) continue;
        byId.set(e.interactionId, Math.max(byId.get(e.interactionId) ?? 0, e.duration));
      }
      w.__inp = [...byId.values()];
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  });
}

/** The worst interaction latency seen so far, as INP reports it for fewer than 50 interactions. */
export async function readInp(page: Page): Promise<{ inp: number; count: number }> {
  return page.evaluate(() => {
    const v = (window as unknown as { __inp: number[] }).__inp ?? [];
    return { inp: Math.round(Math.max(0, ...v)), count: v.length };
  });
}
