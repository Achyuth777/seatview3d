// Serves a built frontend like a static host. Usage: node e2e/support/static-server.mjs <dir> <port> [drop-api]
// With "drop-api", every /api request has its connection cut, which the browser sees as a network failure.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const [root, port, mode] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (mode === 'drop-api' && path.startsWith('/api/')) return req.socket.destroy();
  let file = join(root, normalize(path));
  try { if (!statSync(file).isFile()) throw 0; } catch { file = join(root, path.startsWith('/admin') ? 'admin.html' : 'index.html'); try { statSync(file); } catch { file = join(root, 'index.html'); } }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(Number(port), '127.0.0.1', () => console.log(`static ${root} on ${port}${mode ? ` (${mode})` : ''}`));
