// Builds the private-demo extension into extension-dist/ (viewer page, then the content script) and draws its icon.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const vite = ['node_modules/vite/bin/vite.js', 'build', '-c', 'vite.extension.config.ts'];
execFileSync(process.execPath, vite, { stdio: 'inherit', env: { ...process.env, EXT_PART: 'viewer' } });
execFileSync(process.execPath, vite, { stdio: 'inherit', env: { ...process.env, EXT_PART: 'content' } });

// 128x128 icon: coach-blue square with a yellow screen bar and three seat rows (no external assets).
const S = 128;
const px = Buffer.alloc(S * (S * 4 + 1));
const set = (x, y, [r, g, b]) => { const i = y * (S * 4 + 1) + 1 + x * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let c = [17, 48, 92];
  if (y >= 22 && y < 34 && x >= 18 && x < 110) c = [242, 194, 48];
  for (const [ry, inset] of [[58, 30], [78, 22], [98, 14]]) if (y >= ry && y < ry + 10 && x >= inset && x < S - inset && (x - inset) % 14 < 10) c = [234, 240, 247];
  set(x, y, c);
}
const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync('extension-dist/icon-128.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))]));
console.log('Extension built in extension-dist/ (load unpacked in chrome://extensions).');
