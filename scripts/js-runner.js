/**
 * Amber Learn — JS Runner (sandbox через Blob URL + iframe srcdoc).
 *
 * Каждый вызов runJS создаёт iframe с srcdoc. Для избежания утечек памяти
 * Chromium: после выполнения iframe удаляется из DOM.
 *
 * Ключевое исправление: строковая конкатенация вместо template literal для
 * srcdoc, чтобы \/ внутри <script> не интерпретировался как / и не ломал парсинг.
 */

const TOTAL_TIMEOUT_MS = 5000;
const MAX_OUTPUT_LINES = 500;
const MAX_OUTPUT_CHARS = 100000;

export async function runJS(code, opts = {}) {
  const probe = Array.isArray(opts.probe) ? opts.probe : [];
  const fixture = typeof opts.fixture === 'string' ? opts.fixture : '';

  const escapedCode = String(code).replace(/<\/script>/gi, '&lt;/script&gt;');
  const escapedFixture = fixture.replace(/<\/script>/gi, '&lt;/script&gt;');
  const probeNames = probe.filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n));

  const probeLines = probeNames
    .map((n) => `try { __p["${n}"] = (typeof ${n} !== "undefined") ? ${n} : undefined; } catch (e) {}`)
    .join('\n');

  const inner = [
    'var __stdout=[];',
    'var __stderr=[];',
    'window.__reported = false;',
    'function __reportError(err) {',
    '  var msg;',
    '  if (err && err.message) msg = (err.name || "Error") + ": " + err.message;',
    '  else if (err && typeof err === "object") { try { msg = "Error: " + JSON.stringify(err); } catch (e2) { msg = "Error: " + String(err); } }',
    '  else msg = "Error: " + String(err);',
    '  __stderr.push(msg);',
    '}',
    'window.onerror = function (message, src, line, col, err) {',
    '  __reportError(err || message);',
    '  return false;',
    '};',
    'window.addEventListener("unhandledrejection", function (e) {',
    '  __reportError(e.reason);',
    '});',
    'function __fmt(a) {',
    '  if (typeof a === "string") return a;',
    '  if (a === undefined) return "undefined";',
    '  if (a === null) return "null";',
    '  if (a instanceof Error) return a.name + ": " + a.message;',
    '  if (typeof a === "object") { try { var s = JSON.stringify(a); return s === undefined ? String(a) : s; } catch (e) { return String(a); } }',
    '  return String(a);',
    '}',
    '["log","info","warn"].forEach(function (m) {',
    '  console[m] = function () { if ((__stdout.length + __stderr.length) >= ' + MAX_OUTPUT_LINES + ') return; __stdout.push(Array.prototype.map.call(arguments, __fmt).join(" ")); };',
    '});',
    'console.error = function () { if ((__stdout.length + __stderr.length) >= ' + MAX_OUTPUT_LINES + ') return; __stderr.push(Array.prototype.map.call(arguments, __fmt).join(" ")); };',
    'var __origSetTimeout = window.setTimeout;',
    'var __origClearTimeout = window.clearTimeout;',
    'var __origSetInterval = window.setInterval;',
    'var __origClearInterval = window.clearInterval;',
    'var __timers = new Set();',
    'var __timerId = 1;',
    'window.setTimeout = function (fn, ms) {',
    '  var id = __timerId++;',
    '  var realId = __origSetTimeout(function () { __timers.delete(id); if (typeof fn === "function") fn(); }, ms);',
    '  __timers.add(id);',
    '  return realId;',
    '};',
    'window.clearTimeout = function (id) { __origClearTimeout(id); };',
    'window.setInterval = function (fn, ms) {',
    '  var id = __timerId++;',
    '  __timers.add(id);',
    '  var realId = __origSetInterval(function () { if (typeof fn === "function") fn(); }, ms);',
    '  __timers.delete(id);',
    '  return realId;',
    '};',
    'window.clearInterval = function (id) { __origClearInterval(id); };',
    'var __p = {};',
    'function __finish() {',
    '  if (window.__reported) return;',
    '  window.__reported = true;',
    '  var out = __stdout.join(String.fromCharCode(10));',
    '  if (out.length > ' + MAX_OUTPUT_CHARS + ') {',
    '    out = out.slice(0, ' + MAX_OUTPUT_CHARS + ');',
    '    __stderr.push("Error: Вывод обрезан (лимит ' + MAX_OUTPUT_CHARS + ' символов)");',
    '  }',
    '  out = out + String.fromCharCode(10);',
    '  var err = __stderr.join(String.fromCharCode(10));',
    '  if (err.length > ' + MAX_OUTPUT_CHARS + ') err = err.slice(0, ' + MAX_OUTPUT_CHARS + ');',
    '  try { parent.postMessage({ type: "done", stdout: out, stderr: err, vars: __p }, "*"); } catch(e) {}',
    '}',
    'document.body.innerHTML = ' + JSON.stringify(escapedFixture) + ';',
    '(async function () {',
    '  try {',
    '    ' + escapedCode,
    '  } catch (e) {',
    '    __reportError(e);',
    '  }',
    '  try {',
    probeLines || '',
    '  } catch (e) {}',
    '  var deadline = Date.now() + 4500;',
    '  while (__timers.size > 0 && Date.now() < deadline) {',
    '    await new Promise(function (r) { __origSetTimeout(r, 30); });',
    '  }',
    '  __finish();',
    '})().catch(function (e) { __reportError(e); __finish(); });',
  ].join('\n');

  return new Promise((resolve) => {
    let settled = false;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', listener);
      try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch (e) {}
      resolve({ stdout: '', stderr: 'Error: Превышен таймаут (5 сек)', vars: {} });
    }, TOTAL_TIMEOUT_MS + 2000);

    const finish = (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      window.removeEventListener('message', listener);
      try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch (e) {}
      resolve({
        stdout: typeof data.stdout === 'string' ? data.stdout : '',
        stderr: typeof data.stderr === 'string' ? data.stderr : '',
        vars: data.vars || {},
      });
    };

    const listener = (e) => {
      if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'done') finish(data);
    };
    window.addEventListener('message', listener);

    const htmlOpen = '<!DOCTYPE html><html><body><script>';
    const htmlClose = '</' + 'script></body></html>';
    iframe.srcdoc = htmlOpen + inner + htmlClose;

    document.body.appendChild(iframe);
  });
}
