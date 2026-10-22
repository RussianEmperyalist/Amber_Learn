/**
 * Amber Learn — JS Runner (sandbox через iframe).
 *
 * Один переиспользуемый iframe. Каждый запуск — postMessage в iframe,
 * iframe eval'ит код, ждёт таймеры, postMessage обратно.
 */

let runnerPromise = null;

/**
 * Запускает код в песочнице.
 * @param {string} code
 * @param {{probe?: string[], fixture?: string}} opts
 * @returns {Promise<{stdout: string, stderr: string, vars: object}>}
 */
export async function runJS(code, opts = {}) {
  if (!runnerPromise) {
    runnerPromise = createRunner();
  }
  const runner = await runnerPromise;
  return runner.run(code, opts);
}

function createRunner() {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    document.body.appendChild(iframe);

    const queue = [];
    let busy = false;

    const onMessage = (e) => {
      if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'done') {
        busy = false;
        if (queue.length > 0) {
          const task = queue.shift();
          task.resolve({
            stdout: typeof data.stdout === 'string' ? data.stdout : '',
            stderr: typeof data.stderr === 'string' ? data.stderr : '',
            vars: data.vars || {},
          });
          processNext();
        }
      }
    };
    window.addEventListener('message', onMessage);

    const processNext = () => {
      if (busy || queue.length === 0) return;
      busy = true;
      const task = queue[0];
      iframe.contentWindow.postMessage({
        type: 'run',
        code: task.code,
        probe: task.probe,
        fixture: task.fixture,
      }, '*');
    };

    iframe.addEventListener('load', () => {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      const script = doc.createElement('script');
      script.textContent = [
        'var __queue = [];',
        'var __busy = false;',
        'window.addEventListener("message", function(e) {',
        '  if (!e.source || e.source !== window.parent) return;',
        '  var d = e.data;',
        '  if (!d || d.type !== "run") return;',
        '  if (__busy) { __queue.push(d); return; }',
        '  __busy = true;',
        '  __run(d.code, d.probe || [], d.fixture || "");',
        '});',
        'function __drain() {',
        '  __busy = false;',
        '  if (__queue.length > 0) {',
        '    var d = __queue.shift();',
        '    __busy = true;',
        '    __run(d.code, d.probe || [], d.fixture || "");',
        '  }',
        '}',
        'function __fmt(a) {',
        '  if (typeof a === "string") return a;',
        '  if (a === undefined) return "undefined";',
        '  if (a === null) return "null";',
        '  if (a instanceof Error) return a.name + ": " + a.message;',
        '  if (typeof a === "object") { try { var s = JSON.stringify(a); return s === undefined ? String(a) : s; } catch (e) { return String(a); } }',
        '  return String(a);',
        '}',
        'function __reportError(err, out) {',
        '  var msg;',
        '  if (err && err.message) msg = (err.name || "Error") + ": " + err.message;',
        '  else if (err && typeof err === "object") { try { msg = "Error: " + JSON.stringify(err); } catch (e2) { msg = "Error: " + String(err); } }',
        '  else msg = "Error: " + String(err);',
        '  out.stderr.push(msg);',
        '}',
        'async function __run(code, probe, fixture) {',
        '  var out = { stdout: [], stderr: [] };',
        '  var savedOnError = window.onerror;',
        '  var savedRejection = null;',
        '  window.onerror = function(message, src, line, col, err) { __reportError(err || message, out); return false; };',
        '  var onRej = function(e) { __reportError(e.reason, out); };',
        '  window.addEventListener("unhandledrejection", onRej);',
        '  var savedConsole = {};',
        '  ["log","info","warn","error"].forEach(function(m) {',
        '    savedConsole[m] = console[m];',
        '    console[m] = function() {',
        '      var text = Array.prototype.map.call(arguments, __fmt).join(" ");',
        '      if (m === "error") out.stderr.push(text); else out.stdout.push(text);',
        '    };',
        '  });',
        '  var origST = window.setTimeout, origCT = window.clearTimeout;',
        '  var origSI = window.setInterval, origCI = window.clearInterval;',
        '  var timers = new Set(); var tid = 1;',
        '  window.setTimeout = function(fn, ms) {',
        '    var id = tid++;',
        '    var r = origST(function() { timers.delete(id); if (typeof fn === "function") fn(); }, ms);',
        '    timers.add(id); return r;',
        '  };',
        '  window.clearTimeout = function(id) { origCT(id); };',
        '  window.setInterval = function(fn, ms) {',
        '    var id = tid++; timers.add(id);',
        '    var r = origSI(function() { if (typeof fn === "function") fn(); }, ms);',
        '    timers.delete(id); return r;',
        '  };',
        '  window.clearInterval = function(id) { origCI(id); };',
        '  var vars = {};',
        '  try { document.body.innerHTML = fixture; } catch(e) {}',
        '  var probeLines = probe.filter(function(n){return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n);})',
        '    .map(function(n){ return "try { __vars[\\""+n+"\\" ] = (typeof " + n + " !== \\"undefined\\") ? " + n + " : undefined; } catch(e){}"; })',
        '    .join("\\n");',
        '  var wrapped = "(async function(){\\ntry {\\n" + code + "\\n} catch(e){ __reportError(e, out); }\\n" + probeLines + "\\nvar dl = Date.now()+4500;\\nwhile(timers.size>0 && Date.now()<dl){ await new Promise(function(r){origST(r,30);}); }\\n})().catch(function(e){ __reportError(e, out); }).then(function(){\\n  window.onerror=savedOnError;\\n  window.removeEventListener(\\"unhandledrejection\\", onRej);\\n  Object.keys(savedConsole).forEach(function(m){ console[m]=savedConsole[m]; });\\n  window.setTimeout=origST; window.clearTimeout=origCT; window.setInterval=origSI; window.clearInterval=origCI;\\n  parent.postMessage({ type:\\"done\\", stdout: out.stdout.join(String.fromCharCode(10)), stderr: out.stderr.join(String.fromCharCode(10)), vars: __vars }, \\"*\\");\\n  __drain();\\n});";',
        '  var __vars = vars;',
        '  try { eval(wrapped); } catch(e) { __reportError(e, out); parent.postMessage({ type: "done", stdout: "", stderr: out.stderr.join(String.fromCharCode(10)), vars: {} }, "*"); __drain(); }',
        '}',
      ].join('\n');
      doc.body.appendChild(script);

      resolve({
        run: (code, opts) => {
          return new Promise((res) => {
            queue.push({
              code,
              probe: Array.isArray(opts.probe) ? opts.probe : [],
              fixture: typeof opts.fixture === 'string' ? opts.fixture : '',
              resolve: res,
            });
            processNext();
            setTimeout(() => {
              const idx = queue.findIndex(t => t.resolve === res);
              if (idx !== -1) {
                queue.splice(idx, 1);
                res({ stdout: '', stderr: 'Error: Превышен таймаут (5 сек)', vars: {} });
                if (idx === 0) processNext();
              }
            }, 7000);
          });
        },
        cleanup: () => {
          window.removeEventListener('message', onMessage);
          iframe.remove();
        }
      });
    });

    setTimeout(() => {
      if (iframe.contentDocument) {
        iframe.dispatchEvent(new Event('load'));
      }
    }, 1000);
  });
}
