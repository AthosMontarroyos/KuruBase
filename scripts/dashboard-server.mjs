import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { readFile } from 'node:fs/promises';

const root = normalize(join(process.cwd(), 'apps/dashboard'));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const requested = decodeURIComponent(url.pathname);
  const relative = requested === '/' ? 'index.html' : requested.slice(1);
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(4173, '127.0.0.1', () => console.log('KuruBase dashboard listening on http://127.0.0.1:4173'));
