#!/usr/bin/env node
/**
 * Amber Learn — локальный статический сервер.
 *
 *   node serve.mjs [порт]
 *   # http://localhost:3000
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.js-yaml': 'text/javascript; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const url = new URL(rawUrl, 'http://localhost');
  let pathname = url.pathname;

  // Защита от выхода за корень
  const p = path.normalize(path.join(ROOT, pathname === '/' ? 'index.html' : pathname));
  if (!p.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  fs.stat(p, (err, st) => {
    const file = !err && st.isDirectory() ? path.join(p, 'index.html') : p;
    fs.readFile(file, (e, buf) => {
      if (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Amber Learn // LOCAL SERVER');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
});
