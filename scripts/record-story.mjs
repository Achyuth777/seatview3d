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

// ---- Turns recorded frames into a standard H.264 + AAC MP4 inside the browser (WebCodecs + mp4-muxer). ----
// Frames are placed on an exact 30 fps timeline (each output frame shows the latest captured frame),
// and the file is written with its index at the front ("fast start"), as Instagram expects.
// The soundtrack is generated here (Web Audio), so it is original: a short synth track plus a tap,
// a whoosh and a chime placed at the moments recorded in `events`.
const FPS = 30;
const encoderHtml = `<!doctype html><html><body><script src="https://story.local/mp4-muxer.js"></script><script>
  const SR = 48000;

  /** An original 112 BPM synth loop (C, G, Am, F) with sound effects at the given moments. */
  async function soundtrack(duration, events) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    const end = duration;
    const drumsIn = (events.find((e) => e.kind === 'start') || { t: 2.6 }).t;
    const outro = (events.find((e) => e.kind === 'card') || { t: end - 3 }).t;
    master.gain.setValueAtTime(0, 0);
    master.gain.linearRampToValueAtTime(0.85, 1.2);
    master.gain.setValueAtTime(0.85, end - 1.4);
    master.gain.linearRampToValueAtTime(0, end);

    const noise = ctx.createBuffer(1, SR, SR);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
    const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
    const tone = (type, f, t, a, peak, dec, dest = master, pan = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
      o.type = type; o.frequency.setValueAtTime(f, t); p.pan.value = pan;
      env(g, t, a, peak, dec); o.connect(g); g.connect(p); p.connect(dest); o.start(t); o.stop(t + a + dec + 0.05);
    };
    const hiss = (t, dur, peak, filterType, f0, f1, pan = 0) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
      s.buffer = noise; s.loop = true; f.type = filterType; f.Q.value = 1.2;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      p.pan.value = pan; s.connect(f); f.connect(g); g.connect(p); p.connect(master); s.start(t); s.stop(t + dur + 0.05);
    };

    // Music.
    const beat = 60 / 112;
    const chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]; // C, G, Am, F
    const padBus = ctx.createBiquadFilter(); padBus.type = 'lowpass'; padBus.frequency.value = 1400; padBus.connect(master);
    for (let bar = 0; bar * 4 * beat < outro + 4 * beat; bar++) {
      const t0 = bar * 4 * beat;
      if (t0 >= end) break;
      const ch = chords[bar % 4];
      for (const [k, n] of ch.entries()) tone('sawtooth', hz(n), t0, 0.08, 0.035, 4 * beat, padBus, (k - 1) * 0.4);
      for (let s = 0; s < 8; s++) {
        const t = t0 + s * beat / 2;
        if (t >= end) break;
        // Pluck arpeggio, brighter once the demo starts.
        tone('triangle', hz(ch[[0, 1, 2, 1][s % 4]] + 12 + (s >= 4 ? 12 : 0)), t, 0.005, t < drumsIn ? 0.05 : 0.08, 0.22, master, s % 2 ? 0.3 : -0.3);
        if (t < drumsIn || t > outro + 0.2) continue;
        if (s % 2 === 0) { // kick on the beat
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
          env(g, t, 0.003, 0.75, 0.26); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
          tone('sine', hz(ch[0] - 24), t, 0.01, 0.22, beat * 0.8); // bass
        } else {
          hiss(t, 0.06, 0.05, 'highpass', 7000, 9000, 0.2); // hi-hat
        }
        if (s === 2 || s === 6) hiss(t, 0.16, 0.09, 'bandpass', 1800, 1200); // snare-ish clap
      }
    }

    // Sound effects at the recorded moments.
    for (const e of events) {
      if (e.kind === 'tap') { tone('sine', 1320, e.t, 0.003, 0.35, 0.09); hiss(e.t, 0.04, 0.12, 'highpass', 3000, 4000); }
      if (e.kind === 'whoosh') hiss(e.t, 0.75, 0.16, 'bandpass', 350, 2800, 0);
      if (e.kind === 'card') for (const [i, n] of [72, 76, 79, 84].entries()) tone('sine', hz(n), e.t + i * 0.09, 0.01, 0.16, 1.4, master, (i - 1.5) * 0.3);
    }
    return ctx.startRendering();
  }

  window.encode = async (times, fps, events) => {
    const { Muxer, ArrayBufferTarget } = Mp4Muxer;
    const W = 1080, H = 1920;
    const total = Math.round(times.at(-1) * fps) + Math.round(0.5 * fps);
    const duration = total / fps;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(), fastStart: 'in-memory',
      video: { codec: 'avc', width: W, height: H, frameRate: fps },
      audio: { codec: 'aac', sampleRate: SR, numberOfChannels: 2 },
    });
    let failed = null;
    const onError = (e) => { failed = e; };

    // Sound.
    const audio = await soundtrack(duration, events);
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: onError });
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 192000 });
    const L = audio.getChannelData(0), R = audio.getChannelData(1);
    for (let i = 0; i < audio.length; i += 1024) {
      const n = Math.min(1024, audio.length - i);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      const chunk = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / SR * 1e6), data });
      aenc.encode(chunk); chunk.close();
    }
    await aenc.flush();
    if (failed) throw failed;

    // Picture.
    const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: onError });
    encoder.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 10_000_000, framerate: fps, avc: { format: 'avc' } });
    const canvas = new OffscreenCanvas(W, H), g = canvas.getContext('2d');
    const load = (i) => fetch('https://story.local/frame/' + i).then((r) => r.blob()).then(createImageBitmap);
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
    return { size: buf.byteLength, frames: total, audioSeconds: audio.duration };
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

  // Moments for the sound effects, on the same clock as the frames (seconds since the epoch).
  const events = [];
  const mark = (kind) => events.push({ kind, t: Date.now() / 1000 });

  await sleep(2600);                                   // title card
  await page.evaluate(() => { window.card(null); window.caption('1. Turn on 3D seat view'); });
  mark('start');
  await sleep(900);
  await move(toggle);
  await sleep(300);
  mark('tap');
  await toggle.click();                                 // our own switch
  await main.locator('xpath=self::*[@data-rows]').waitFor({ timeout: 20_000 });
  await sleep(1800);
  await page.evaluate(() => window.caption('2. Point at any seat: front row'));
  await move(seat(0, 3));                               // front row L
  mark('whoosh');                                       // the camera flies to the seat
  await arrive('L3');
  await sleep(1700);
  await page.evaluate(() => window.caption('Middle: the sweet spot'));
  await move(seat(5, 10));                              // middle, row G
  mark('whoosh');
  await arrive('G10');
  await sleep(1700);
  await page.evaluate(() => window.caption('Back row: the whole screen'));
  await move(seat(11, 13));                             // back row A
  mark('whoosh');
  await arrive('A13');
  await sleep(1700);
  await page.evaluate(() => window.caption('3. Tap to keep your pick'));
  await move(seat(4, 13));                              // row H, middle
  mark('tap');
  mark('whoosh');
  await page.mouse.down(); await sleep(120); await page.mouse.up();
  await arrive('H13');
  await sleep(2000);
  mark('card');
  await page.evaluate(() => window.card('<h1>SEATVIEW 3D</h1><p>Works right on the seat map<br>of District and PVR INOX</p><small>Private demo · rebuilt from the real seat layout · sizes estimated</small>'));
  await sleep(3200);
  await cdp.send('Page.stopScreencast');

  if (frames.length < 20) throw new Error(`Only ${frames.length} frames were captured`);
  const t0 = frames[0].t;
  const times = frames.map((f) => f.t - t0);
  console.log(`captured ${frames.length} frames over ${times.at(-1).toFixed(1)} s`);

  const enc = await ctx.newPage();
  await enc.goto('https://story.local/encode');
  const cues = events.map((e) => ({ kind: e.kind, t: Math.max(0, e.t - t0) }));
  const { size, frames: written, audioSeconds } = await enc.evaluate(([ts, fps, ev]) => window.encode(ts, fps, ev), [times, FPS, cues]);
  console.log(`encoded ${written} frames at ${FPS} fps, ${audioSeconds.toFixed(1)} s of sound; cues: ${cues.map((c) => `${c.kind}@${c.t.toFixed(1)}`).join(' ')}`);
  if (!upload) throw new Error('The encoder did not hand back the video');
  mkdirSync(resolve('docs/extension'), { recursive: true });
  writeFileSync(OUT, upload);
  const copy = join(homedir(), 'Downloads', 'seatview-story.mp4');
  copyFileSync(OUT, copy);
  console.log(`video: ${OUT} (${(size / 1e6).toFixed(1)} MB); copy: ${copy}`);
} finally {
  await ctx.close();
}
