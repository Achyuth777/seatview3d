// Records a vertical (1080x1920) MP4 for an Instagram story, using only our own material:
// a plain seat map drawn from the real PVR Palazzo layout (e2e/fixtures), the extension's 3D panel,
// and a SeatView title card on the screen. No booking site is contacted: its address is served locally.
// Usage: npm run build:extension && node scripts/record-story.mjs
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OUT = resolve('docs/extension/seatview-story.mp4');
const ext = resolve('extension-dist');
const layout = JSON.parse(readFileSync('e2e/fixtures/pvr-palazzo-2026-11-26.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- The picture on the 3D screen: our own title card. ----
const cardHtml = `<!doctype html><html><body style="margin:0;width:1600px;height:670px;display:grid;place-items:center;
  background:radial-gradient(circle at 30% 40%,#1d4f91,#0b1a30 70%);font-family:Impact,'Arial Narrow',sans-serif;color:#f2c230">
  <div style="text-align:center"><div style="font-size:200px;letter-spacing:6px;line-height:1">SEATVIEW 3D</div>
  <div style="font:600 46px/1.4 system-ui,sans-serif;color:#eaf0f7;letter-spacing:8px">SEE YOUR SEAT BEFORE YOU BOOK</div></div></body></html>`;

// ---- The story page: header, caption, seat map. The extension adds the switch and the 3D panel. ----
const seatCell = (t) => t === '.' ? '<td><span class="seat_hidden">X</span></td>'
  : t.startsWith('a') ? `<td><span class="seat-current-pvr" data-seat="${t.slice(1)}">${t.slice(1)}</span></td>`
    : `<td><span class="seat-disable">${t.slice(1)}</span></td>`;
const storyHtml = `<!doctype html><html><head><meta name="viewport" content="width=540"><title>SeatView 3D</title><style>
  html,body{margin:0;background:#0b1a30;color:#eaf0f7;font-family:system-ui,sans-serif;overflow:hidden}
  header{padding:14px 18px 6px;display:flex;align-items:baseline;gap:10px}
  .brand{font:800 30px/1 Impact,'Arial Narrow',sans-serif;color:#f2c230;letter-spacing:1px}
  .tag{font-size:13px;color:#9fb3cc}
  #cap{margin:0 18px;height:22px;font:700 16px/22px system-ui,sans-serif;color:#fff;transition:opacity .3s}
  .screen{margin:8px auto 4px;width:300px;height:5px;border-radius:50%/100%;background:#f2c230;box-shadow:0 0 14px #f2c230}
  .screenTxt{text-align:center;font-size:9px;letter-spacing:4px;color:#9fb3cc;margin-bottom:2px}
  .seat-category-heading{font-size:8px;letter-spacing:2px;color:#9fb3cc;padding-left:14px;height:10px}
  table{border-collapse:separate;border-spacing:1px;margin:0 auto}
  td span{display:block;width:14px;height:13px;border-radius:3px 3px 2px 2px;font-size:0}
  .seat-current-pvr{background:#2f6fbf} .seat-current-pvr.picked{background:#f2c230}
  .seat-disable{background:#33425a} .seat_hidden{visibility:hidden} .seat-row-no{font:600 8px/13px system-ui;color:#9fb3cc;width:10px!important;text-align:center}
  .off{position:absolute;left:-9999px}
  #cursor{position:fixed;z-index:2147483647;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgb(255 255 255/.35);border:3px solid #fff;
    box-shadow:0 2px 10px rgb(0 0 0/.5);pointer-events:none;left:-60px;top:-60px;transition:transform .15s}
  #cursor.tap{transform:scale(.7)}
  #card{position:fixed;inset:0;z-index:2147483647;background:radial-gradient(circle at 50% 35%,#1d4f91,#0b1a30 70%);display:grid;place-items:center;text-align:center;transition:opacity .6s;pointer-events:none}
  #card h1{margin:0;font:400 70px/1 Impact,'Arial Narrow',sans-serif;color:#f2c230;letter-spacing:2px}
  #card p{margin:14px 30px 0;font:600 22px/1.35 system-ui,sans-serif}
  #card small{display:block;margin-top:26px;font-size:14px;color:#9fb3cc;letter-spacing:1px}
</style></head><body>
  <header><span class="brand">SeatView 3D</span><span class="tag">a browser extension</span></header>
  <p id="cap"></p>
  <div class="screen"></div><div class="screenTxt">SCREEN</div>
  <div class="all-seats">${layout.areas.map((a) => `<div class="seat-category-heading"><span class="seat-category-name">${a.name}</span></div>
    <table><tbody>${a.rows.map((r) => `<tr class="seats-row"><td><span class="seat-row-no">${r.label}</span></td>${r.pattern.split(' ').map(seatCell).join('')}</tr>`).join('')}</tbody></table>`).join('')}</div>
  <div class="off"><div class="summary-movies-photo"><img src="https://img.pvrcinemas.com/story-card.png" alt=""></div>
    <div class="summary-movies-content"><h5>Tonight’s show</h5><p>Fri, 9:30 PM</p><p>12-row hall, real seat layout</p></div></div>
  <div id="cursor"></div>
  <div id="card"><div><h1>WHICH SEAT?</h1><p>See the view from any seat<br>before you book</p></div></div>
  <script>
    const c = document.getElementById('cursor');
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => c.classList.add('tap'), true);
    addEventListener('mouseup', () => c.classList.remove('tap'), true);
    addEventListener('click', (e) => { const s = e.target.closest('.seat-current-pvr'); if (s) s.classList.add('picked'); });
    window.caption = (t) => { const p = document.getElementById('cap'); p.style.opacity = 0; setTimeout(() => { p.textContent = t; p.style.opacity = 1; }, 300); };
    window.card = (html) => { const k = document.getElementById('card'); if (html === null) { k.style.opacity = 0; return; } k.firstElementChild.innerHTML = html; k.style.opacity = 1; };
  </script></body></html>`;

// ---- Turns recorded frames into a standard H.264 MP4 inside the browser (WebCodecs + mp4-muxer). ----
// Frames are placed on an exact 30 fps timeline (each output frame shows the latest captured frame),
// and the file is written with its index at the front ("fast start"), as Instagram expects.
const FPS = 30;
const encoderHtml = `<!doctype html><html><body><script src="https://story.local/mp4-muxer.js"></script><script>
  window.encode = async (times, fps) => {
    const { Muxer, ArrayBufferTarget } = Mp4Muxer;
    const W = 1080, H = 1920;
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
    let failed = null;
    const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
    encoder.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 10_000_000, framerate: fps, avc: { format: 'avc' } });
    const canvas = new OffscreenCanvas(W, H), g = canvas.getContext('2d');
    const load = (i) => fetch('https://story.local/frame/' + i).then((r) => r.blob()).then(createImageBitmap);
    const total = Math.round(times.at(-1) * fps) + Math.round(0.5 * fps);
    let src = 0, shown = -1;
    for (let k = 0; k < total; k++) {
      const t = k / fps;
      while (src + 1 < times.length && times[src + 1] <= t) src++;
      if (src !== shown) { const img = await load(src); g.drawImage(img, 0, 0, W, H); img.close(); shown = src; }
      const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: k % (fps * 2) === 0 });
      frame.close();
      if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
      if (failed) throw failed;
    }
    await encoder.flush();
    muxer.finalize();
    const buf = muxer.target.buffer;
    await fetch('https://story.local/upload', { method: 'POST', body: buf });
    return { size: buf.byteLength, frames: total };
  };
</script></body></html>`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'svstory-')), {
  ...(process.env.EXT_BROWSER === 'chromium' ? {} : { channel: 'msedge' }), headless: false,
  viewport: { width: 540, height: 960 }, deviceScaleFactor: 2,
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  // Title card image for the 3D screen.
  const cardPage = await ctx.newPage();
  await cardPage.setViewportSize({ width: 1600, height: 670 });
  await cardPage.setContent(cardHtml);
  const cardPng = await cardPage.screenshot({ type: 'png', scale: 'css' });
  await cardPage.close();

  const frames = [];
  let upload = null;
  await ctx.route('https://www.pvrcinemas.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: storyHtml }));
  await ctx.route('https://img.pvrcinemas.com/**', (r) => r.fulfill({ contentType: 'image/png', body: cardPng }));
  await ctx.route('https://story.local/**', async (r) => {
    const url = r.request().url();
    if (url.endsWith('/encode')) return r.fulfill({ contentType: 'text/html', body: encoderHtml });
    if (url.endsWith('/mp4-muxer.js')) return r.fulfill({ contentType: 'text/javascript', body: readFileSync('node_modules/mp4-muxer/build/mp4-muxer.js') });
    if (url.includes('/frame/')) return r.fulfill({ contentType: 'image/jpeg', body: frames[Number(url.split('/').pop())].data });
    if (url.endsWith('/upload')) { upload = r.request().postDataBuffer(); return r.fulfill({ status: 204 }); }
    return r.fulfill({ status: 404 });
  });

  const page = await ctx.newPage();
  await page.goto('https://www.pvrcinemas.com/seatlayout/story');
  const toggle = page.locator('#seatview-district-root button');
  await toggle.waitFor({ timeout: 30_000 });
  if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click(); // start with the switch off
  await page.mouse.move(270, 1100);
  await sleep(800);

  // Record the page as the viewer would see it.
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data: Buffer.from(data, 'base64'), t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });

  const panel = page.frameLocator('iframe[title="SeatView 3D seat view"]');
  const main = panel.locator('main');
  const move = async (loc, steps = 28) => { const b = await loc.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps }); };
  const seat = (row, n) => page.locator('tr.seats-row').nth(row).locator(`[data-seat="${n}"]`);
  const arrive = async (id) => { await main.locator(`xpath=self::*[@data-camera-seat="${id}"]`).waitFor({ timeout: 15_000 }).catch(() => {}); };

  await sleep(2600);                                   // title card
  await page.evaluate(() => { window.card(null); window.caption('1. Turn on 3D seat view'); });
  await sleep(900);
  await move(toggle);
  await sleep(300);
  await toggle.click();                                 // our own switch
  await main.locator('xpath=self::*[@data-rows]').waitFor({ timeout: 20_000 });
  await sleep(1800);
  await page.evaluate(() => window.caption('2. Point at any seat: front row'));
  await move(seat(0, 3));                               // front row L
  await arrive('L3');
  await sleep(1700);
  await page.evaluate(() => window.caption('Middle: the sweet spot'));
  await move(seat(5, 10));                              // middle, row G
  await arrive('G10');
  await sleep(1700);
  await page.evaluate(() => window.caption('Back row: the whole screen'));
  await move(seat(11, 13));                             // back row A
  await arrive('A13');
  await sleep(1700);
  await page.evaluate(() => window.caption('3. Tap to keep your pick'));
  await move(seat(4, 13));                              // row H, middle
  await page.mouse.down(); await sleep(120); await page.mouse.up();
  await arrive('H13');
  await sleep(2000);
  await page.evaluate(() => window.card('<h1>SEATVIEW 3D</h1><p>Works right on the seat map<br>of District and PVR INOX</p><small>Private demo · rebuilt from the real seat layout · sizes estimated</small>'));
  await sleep(3200);
  await cdp.send('Page.stopScreencast');

  if (frames.length < 20) throw new Error(`Only ${frames.length} frames were captured`);
  const t0 = frames[0].t;
  const times = frames.map((f) => f.t - t0);
  console.log(`captured ${frames.length} frames over ${times.at(-1).toFixed(1)} s`);

  const enc = await ctx.newPage();
  await enc.goto('https://story.local/encode');
  const { size, frames: written } = await enc.evaluate(([ts, fps]) => window.encode(ts, fps), [times, FPS]);
  console.log(`encoded ${written} frames at ${FPS} fps`);
  if (!upload) throw new Error('The encoder did not hand back the video');
  mkdirSync(resolve('docs/extension'), { recursive: true });
  writeFileSync(OUT, upload);
  const copy = join(homedir(), 'Downloads', 'seatview-story.mp4');
  copyFileSync(OUT, copy);
  console.log(`video: ${OUT} (${(size / 1e6).toFixed(1)} MB); copy: ${copy}`);
} finally {
  await ctx.close();
}
