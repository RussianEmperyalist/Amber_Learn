import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, stat, readFile } from 'fs';
import { join, extname, dirname } from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'content', 'javascript');
const DOM_LESSONS = ['26-dom-basics', '27-events', '28-forms', '30-project-todo'];

const lessons = {};
const diskFiles = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
for (const f of diskFiles) {
  const id = f.replace('.json', '');
  lessons[id] = JSON.parse(readFileSync(join(CONTENT_DIR, f), 'utf8'));
}

function getExpectedStdout(task) {
  const check = task.checks?.find(c => c.kind === 'stdout-exact');
  return check ? String(check.equals ?? check.value ?? '') : null;
}

function getFixture(lesson, task) {
  return task.fixture || '';
}

let server;
let baseUrl;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startServer(port = 3999) {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      let pathname = url.pathname;
      const p = join(ROOT, pathname === '/' ? 'index.html' : pathname);
      if (!p.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end('403');
      }
      stat(p, (err, st) => {
        const file = !err && st.isDirectory() ? join(p, 'index.html') : p;
        readFile(file, (e, buf) => {
          if (e) {
            res.writeHead(404);
            return res.end('404 Not found');
          }
          res.writeHead(200, {
            'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',
          });
          res.end(buf);
        });
      });
    });
    server.listen(port, () => {
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  if (server) server.close();
});

const runCodeInBrowser = async (page, code, fixture) => {
  return await page.evaluate(async ({ code, fixture, url }) => {
    const resp = await fetch(url + '/scripts/js-runner.js?v=5');
    const scriptContent = await resp.text();
    const moduleBlob = new Blob([scriptContent], { type: 'application/javascript' });
    const moduleUrl = URL.createObjectURL(moduleBlob);
    const mod = await import(moduleUrl);
    const r = await mod.runJS(code, { fixture: fixture });
    URL.revokeObjectURL(moduleUrl);
    return r;
  }, { code, fixture, url: baseUrl });
};

test.describe('DOM lessons — browser verification (solutions)', () => {
  for (const lessonId of DOM_LESSONS) {
    const lesson = lessons[lessonId];
    if (!lesson) continue;

    test.describe(lessonId, () => {
      for (const task of (lesson.tasks || [])) {
        const expected = getExpectedStdout(task);
        if (!expected) continue;

        test(`${task.id}: stdout="${expected}"`, async ({ page }) => {
          const fixture = getFixture(lesson, task);
          const solution = task.solution || '';

          await page.goto(baseUrl);
          const result = await runCodeInBrowser(page, solution, fixture);

          expect(result.stderr).toBe('');
          expect(result.stdout.trim()).toBe(expected.trim());
        });
      }
    });
  }
});

test.describe('DOM lessons — starter activation produces expected output', () => {
  for (const lessonId of DOM_LESSONS) {
    const lesson = lessons[lessonId];
    if (!lesson) continue;

    test.describe(lessonId, () => {
      for (const task of (lesson.tasks || [])) {
        const expected = getExpectedStdout(task);
        if (!expected) continue;

        const starter = task.starter || '';
        if (!starter.trim()) continue;

        test(`${task.id}: activated starter`, async ({ page }) => {
          const fixture = getFixture(lesson, task);
          // Skip starter tests that depend on fixture HTML (e.g., querySelector on #id not created in starter)
          const needsFixture = !fixture && (starter.includes('querySelector') || starter.includes('getElementById'));
          if (needsFixture) {
            test.skip('requires fixture');
          }
          const activated = starter.replace(/(^|\n)\/\/\s?/g, '$1');

          await page.goto(baseUrl);
          const result = await runCodeInBrowser(page, activated, fixture);

          expect(result.stderr).toBe('');
          expect(result.stdout.trim()).toBe(expected.trim());
        });
      }
    });
  }
});
