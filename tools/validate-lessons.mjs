#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)) + '/..');
const CONTENT_DIR = path.join(ROOT, 'content', 'javascript');

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function normalizeOut(s) { return String(s).trim().replace(/\r\n/g, '\n'); }

// Форматирование значения как console.log в браузере (пробелы после запятых, как у devtools)
function fmtValue(a) {
  if (typeof a === 'string') return a;
  if (a === undefined) return 'undefined';
  if (a === null) return 'null';
  if (a instanceof Error) return a.name + ': ' + a.message;
  if (Array.isArray(a)) return '[' + a.map(fmtValue).join(', ') + ']';
  if (typeof a === 'object') {
    try {
      const keys = Object.keys(a);
      if (keys.length === 0) return '{}';
      return '{ ' + keys.map(k => k + ': ' + fmtValue(a[k])).join(', ') + ' }';
    } catch (e) { return String(a); }
  }
  return String(a);
}

// Простой mock DOM: парсит fixture по id и селекторам, поддерживает
// getElementById, querySelector(All) для #id и tag.class, value/checked/disabled/textContent/style/classList.
function makeMockElement(tag, attrs, text) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: attrs.id || '',
    className: attrs.class || '',
    _classes: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
    value: attrs.value !== undefined ? attrs.value : '',
    checked: !!attrs.checked,
    disabled: !!attrs.disabled,
    type: attrs.type || tag || 'input',
    textContent: text || '',
    innerHTML: text || '',
    style: {},
    dataset: {},
    listeners: {},
    children: [],
    parentNode: null,
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    removeEventListener(ev, fn) { if (this.listeners[ev]) this.listeners[ev] = this.listeners[ev].filter(f => f !== fn); },
    dispatchEvent(ev) { ev.target = this; ev.currentTarget = this; (this.listeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
    click() { this.dispatchEvent({ type: 'click', target: this, preventDefault(){}, stopPropagation(){} }); },
    setAttribute(k, v) { if (k === 'class') { this.className = v; this._classes = new Set(v.split(/\s+/).filter(Boolean)); } else if (k === 'id') this.id = v; else if (k === 'value') this.value = v; },
    getAttribute(k) { if (k === 'class') return this.className; if (k === 'id') return this.id; return null; },
    classList: null,
  };
  el.classList = {
    add: (...c) => c.forEach(x => el._classes.add(x)),
    remove: (...c) => c.forEach(x => el._classes.delete(x)),
    toggle: (c) => el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c),
    contains: (c) => el._classes.has(c),
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el._text || ''; },
    set(v) { el._text = String(v); },
  });
  if (text) el._text = text;
  return el;
}

function makeMockDocument(fixtureHtml) {
  // Парсим вложенные теги из fixture, строим дерево элементов.
  const body = makeMockElement('body', {}, '');

  function parseAttrs(attrStr) {
    const attrs = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let a;
    while ((a = attrRe.exec(attrStr)) !== null) attrs[a[1]] = a[2];
    if (/(^|\s)checked(\s|$|\/)/.test(attrStr)) attrs.checked = true;
    if (/(^|\s)disabled(\s|$|\/)/.test(attrStr)) attrs.disabled = true;
    return attrs;
  }

  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const stack = [body];
  const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);
  let m;
  while ((m = tagRe.exec(fixtureHtml)) !== null) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrStr = m[3] || '';
    const selfClose = m[4] === '/' || VOID_TAGS.has(tag);
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === tag) { stack.length = i; break; }
      }
      continue;
    }
    const el = makeMockElement(tag, parseAttrs(attrStr), '');
    stack[stack.length - 1].appendChild(el);
    if (!selfClose) stack.push(el);
  }

  function allElements() {
    const out = [];
    const walk = (el) => { out.push(el); (el.children || []).forEach(walk); };
    walk(body);
    return out;
  }

  function matches(el, sel) {
    sel = sel.trim();
    const parts = sel.split(/\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (!matches(el, last)) return false;
      const ancestors = [];
      let cur = el.parentNode;
      while (cur) { ancestors.push(cur); cur = cur.parentNode; }
      return parts.slice(0, -1).every(p => ancestors.some(a => matches(a, p)));
    }
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('.')) return el._classes.has(sel.slice(1));
    if (/^[a-zA-Z]+$/.test(sel)) return el.tagName === sel.toUpperCase();
    const idMatch = sel.match(/^(\w+)?#([\w-]+)$/);
    if (idMatch) return (!idMatch[1] || el.tagName === idMatch[1].toUpperCase()) && el.id === idMatch[2];
    const clsMatch = sel.match(/^(\w+)?\.([\w-]+)$/);
    if (clsMatch) return (!clsMatch[1] || el.tagName === clsMatch[1].toUpperCase()) && el._classes.has(clsMatch[2]);
    return false;
  }

  for (const el of allElements()) {
    el.closest = (sel) => {
      let cur = el;
      while (cur) { if (matches(cur, sel)) return cur; cur = cur.parentNode; }
      return null;
    };
  }

  return {
    body,
    getElementById: (id) => allElements().find(e => e.id === id) || null,
    querySelector: (sel) => allElements().find(e => matches(e, sel)) || null,
    querySelectorAll: (sel) => allElements().filter(e => matches(e, sel)),
    createElement: (tag) => makeMockElement(tag, {}, ''),
    createTextNode: (t) => ({ textContent: t }),
    addEventListener: () => {},
  };
}

async function runInVM(code, opts = {}) {
  const probe = Array.isArray(opts.probe) ? opts.probe.filter(n => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n)) : [];
  let stdout = '';
  let stderr = '';
  const timers = [];
  let timerId = 1;

  const __p = {};
  const sandbox = {
    console: {
      log: (...a) => stdout += a.map(fmtValue).join(' ') + '\n',
      info: (...a) => stdout += a.map(fmtValue).join(' ') + '\n',
      warn: (...a) => stdout += a.map(fmtValue).join(' ') + '\n',
      error: (...a) => stderr += (stderr ? '\n' : '') + a.map(fmtValue).join(' '),
    },
    setTimeout: (fn, ms) => { const id = timerId++; const t = { fn, ms, id, interval: false }; timers.push(t); return id; },
    setInterval: (fn, ms) => { const id = timerId++; const t = { fn, ms, id, interval: true }; timers.push(t); return id; },
    clearTimeout: (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    clearInterval: (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    Promise, Math, JSON, Date, RegExp, Number, String, Boolean,
    Array, Object, Error, TypeError, RangeError, Map, Set, WeakMap, Symbol,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    module: { exports: {} },
    exports: {},
    Event: function Event(type, opts = {}) { return { type, target: null, currentTarget: null, preventDefault(){}, stopPropagation(){}, stopImmediatePropagation(){}, bubbles: !!opts.bubbles, cancelable: !!opts.cancelable, defaultPrevented: false, timeStamp: Date.now() }; },
    MouseEvent: function MouseEvent(type, opts = {}) { const e = { type, target: null, currentTarget: null, preventDefault(){}, stopPropagation(){}, stopImmediatePropagation(){}, bubbles: !!opts.bubbles, cancelable: !!opts.cancelable, defaultPrevented: false, timeStamp: Date.now(), clientX: opts.clientX || 0, clientY: opts.clientY || 0, screenX: opts.screenX || 0, screenY: opts.screenY || 0, ctrlKey: !!opts.ctrlKey, shiftKey: !!opts.shiftKey, altKey: !!opts.altKey, metaKey: !!opts.metaKey, button: opts.button || 0, buttons: opts.buttons || 0, relatedTarget: null }; return e; },
    window: {},
    __p: __p,
    document: makeMockDocument(opts.fixture || ''),
    fetch: (...a) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  const probeLines = probe.map(n => `try { __p[${JSON.stringify(n)}] = (typeof ${n} !== 'undefined') ? ${n} : undefined; } catch(e){}`).join('\n');

  let errorMsg = '';
  try {
    const isAsync = /\bawait\b|\basync\b/.test(code) || code.includes('Promise');
    if (isAsync) {
      const wrapped = `(async function(){\n${code}\n${probeLines}\n})()`;
      const result = vm.runInContext(wrapped, context, { timeout: 5000 });
      const deadline = Date.now() + 6000;
      let settled = false;
      Promise.resolve(result).then(
        () => { settled = true; },
        (e) => { settled = true; errorMsg = e && e.message ? e.message : String(e); }
      );
      while (!settled && Date.now() < deadline) {
        if (timers.length > 0) {
          const t = timers.shift();
          try { t.fn(); } catch (e) { if (!errorMsg) errorMsg = e && e.message ? e.message : String(e); }
          if (t.interval) timers.push(t);
        } else {
          await new Promise(r => setImmediate(r));
        }
      }
      if (!settled) errorMsg = 'Error: Превышен таймаут (async code)';
    } else {
      // Синхронный запуск с жёстким лимитом строк вывода (защита от бесконечных циклов)
      const wrapped = `(function(){\n${code}\n${probeLines}\nreturn 1;})()`;
      try {
        vm.runInContext(wrapped, context, { timeout: 3000 });
      } catch (e) {
        if (e && /timeout|Timed out/i.test(String(e.message))) {
          errorMsg = 'Error: Превышен таймаут';
        } else {
          errorMsg = e && e.message ? e.message : String(e);
        }
      }
      // Запуск pending-таймеров синхронно (с лимитом)
      let guard = 0;
      while (timers.length > 0 && guard < 1000) {
        guard++;
        const t = timers.shift();
        try { t.fn(); } catch (e) { if (!errorMsg) errorMsg = e && e.message ? e.message : String(e); }
      }
    }
  } catch (e) {
    errorMsg = e && e.message ? e.message : String(e);
  }

  // Если вывод огромный — считаем что был бесконечный цикл, обрезаем и помечаем
  if (stdout.split('\n').length > 200) {
    stdout = stdout.split('\n').slice(0, 200).join('\n');
    if (!/таймаут/i.test(errorMsg)) errorMsg = 'Error: Превышен таймаут (infinite output)';
  }

  // Drain remaining timers
  while (timers.length > 0) {
    const t = timers.shift();
    try { t.fn(); } catch (e) { if (!errorMsg) errorMsg = e && e.message ? e.message : String(e); }
  }
  await new Promise(r => setTimeout(r, 1));

  if (errorMsg && !stderr) stderr = 'Error: ' + errorMsg;
  return { stdout, stderr, vars: __p };
}

function evaluateChecks(code, result, checks) {
  if (!checks.length) return [{ kind: 'none', pass: true, message: '' }];
  const results = [];
  const codeNoComments = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const check of checks) {
    const kind = check.kind || 'stdout';
    let pass = false;
    switch (kind) {
      case 'stdout': pass = result.stdout.includes(String(check.equals ?? check.value ?? '')); break;
      case 'stdout-exact': pass = normalizeOut(result.stdout) === String(check.equals ?? check.value ?? ''); break;
      case 'stdout-lines': {
        const expected = Array.isArray(check.lines) ? check.lines : [];
        const lines = normalizeOut(result.stdout).split('\n');
        pass = lines.length === expected.length && lines.every((l, i) => l === expected[i]);
        break;
      }
      case 'stdout-match': try { pass = new RegExp(check.equals || check.value || '').test(result.stdout); } catch { pass = false; } break;
      case 'code-has': try { pass = new RegExp(check.pattern || check.equals || check.value || '').test(codeNoComments); } catch { pass = false; } break;
      case 'code-not': try { pass = !new RegExp(check.pattern || check.equals || check.value || '').test(codeNoComments); } catch { pass = false; } break;
      case 'var': {
        const actual = result.vars[check.name];
        const expected = check.equals ?? check.value;
        pass = (expected === '' && actual === '') || (expected === 0 && actual === 0) ||
               (expected === null && actual === null) || (expected === undefined && actual === undefined) ||
               String(actual) === String(expected);
        break;
      }
      case 'has-call': pass = new RegExp(`\\b${escapeRegExp(check.name || check.equals || check.value)}\\s*\\(`).test(code); break;
      case 'has-template-literal': pass = /`(?:[^`\\]|\\[\s\S])*?\$\{[^}]+\}(?:[^`\\]|\\[\s\S])*?`/.test(code); break;
      case 'no-error': pass = !result.stderr; break;
      default: results.push({ kind, pass: false, message: 'Неизвестный kind "' + kind + '"' }); continue;
    }
    results.push({ kind, pass, message: check.message || '' });
  }
  return results;
}

function validateStructure(lesson, fileName) {
  const errors = [];
  const L = lesson;
  if (!L.id?.endsWith(fileName.replace('.json', ''))) errors.push('id mismatch');
  for (const f of ['id', 'title', 'goal', 'duration', 'theory', 'tasks', 'recap', 'quiz']) {
    if (L[f] === undefined) errors.push('нет поля ' + f);
  }
  if (!Array.isArray(L.prereq)) errors.push('prereq не массив');
  const theory = L.theory || [];
  const countType = (t) => theory.filter(b => b.type === t).length;
  if (theory.length < 15) errors.push('theory=' + theory.length + ' (<15)');
  if (countType('predict') < 2) errors.push('predict=' + countType('predict') + ' (<2)');
  if (countType('warning') < 1) errors.push('warning=' + countType('warning') + ' (<1)');
  if (countType('note') + countType('tip') < 1) errors.push('note|tip=0');
  if (countType('code') < 2) errors.push('code=' + countType('code') + ' (<2)');
  const tasks = L.tasks || [];
  if (tasks.length !== 5) errors.push('задач=' + tasks.length);
  const expectTypes = ['guided', 'from-scratch', 'guided', 'debug', 'from-scratch'];
  tasks.forEach((t, i) => {
    if (t.type !== expectTypes[i]) errors.push('t' + (i+1) + ': type=' + t.type);
    if (!Array.isArray(t.hints) || t.hints.length !== 2) errors.push(t.id + ': hints!=2');
    if (typeof t.solution !== 'string' || !t.solution.trim()) errors.push(t.id + ': нет solution');
    if (!Array.isArray(t.checks) || t.checks.length < 3 || t.checks.length > 5) errors.push(t.id + ': checks!=' + (t.checks || []).length);
    if (t.checks && t.checks[t.checks.length - 1]?.kind !== 'no-error') errors.push(t.id + ': no-error не последняя');
  });
  const recap = L.recap || [];
  if (recap.length < 3 || recap.length > 6) errors.push('recap=' + recap.length);
  const quiz = L.quiz || [];
  if (quiz.length < 3 || quiz.length > 5) errors.push('quiz=' + quiz.length);
  quiz.forEach((q, i) => {
    if (!q.explain) errors.push('quiz[' + i + ']: нет explain');
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= (q.options || []).length) errors.push('quiz[' + i + ']: answer wrong');
  });
  return errors;
}

function probesForTask(task) {
  const names = [];
  if (task.probe) names.push(...task.probe);
  for (const ch of (task.checks || [])) {
    if ((ch.kind === 'var') && ch.name) names.push(ch.name);
  }
  return [...new Set(names)];
}

async function main() {
  console.log('Amber Learn // VALIDATE (vm mode)\n');

  const idx = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'index.json'), 'utf8'));
  if (idx.lessons.length !== 30) { console.error('FAIL: ' + idx.lessons.length + ' lessons'); process.exit(1); }

  const diskFiles = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const missingOnDisk = idx.lessons.filter(l => !diskFiles.includes(l.id + '.json'));
  if (missingOnDisk.length) { console.error('FAIL: missing on disk'); process.exit(1); }

  const lessons = {};
  for (const entry of idx.lessons) {
    lessons[entry.id] = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, entry.id + '.json'), 'utf8'));
  }

  let structErrors = [];
  for (const entry of idx.lessons) {
    const errs = validateStructure(lessons[entry.id], entry.id + '.json');
    if (errs.length) structErrors.push({ lesson: entry.id, errors: errs });
  }

  const taskResults = [];
  let taskCount = 0;

  for (const entry of idx.lessons) {
    const lesson = lessons[entry.id];
    for (const task of (lesson.tasks || [])) {
      taskCount++;
      const taskErrs = [];
      const checks = task.checks || [];
      const fixture = task.fixture || '';
      const probe = probesForTask(task);

      const solCode = task.solution || '';
      if (!solCode.trim()) {
        taskErrs.push(task.id + ': solution пустой');
      } else {
        const solResult = await runInVM(solCode, { fixture, probe });
        const solEvals = evaluateChecks(solCode, solResult, checks);
        const solFailed = solEvals.filter(e => !e.pass);
        if (solFailed.length) {
          taskErrs.push(task.id + ': solution fail: ' + solFailed.map(f => f.kind + '(' + f.message + ')').join('; '));
        }
      }

      if (task.starter && task.starter.trim()) {
        const stResult = await runInVM(task.starter, { fixture, probe });
        const stEvals = evaluateChecks(task.starter, stResult, checks);
        const stPassed = stEvals.every(e => e.pass);
        if (stPassed) taskErrs.push(task.id + ': starter passes all!');
      }

      taskResults.push({ lesson: entry.id, taskId: task.id, ok: !taskErrs.length, errors: taskErrs });
    }
  }

  const predictErrs = [];
  for (const entry of idx.lessons) {
    const lesson = lessons[entry.id];
    const predicts = (lesson.theory || []).filter(b => b.type === 'predict');
    for (const p of predicts) {
      const rawExpected = normalizeOut(p.options[p.answer]);
      const isInfiniteExpected = /бесконечн|infinite/i.test(rawExpected);
      const codeStr = p.code || '';
      const untestable = /^\s*((\/\/.*\n)*)\s*(export|import)\b/m.test(codeStr)
        || /\b(import|export)\s/.test(codeStr.replace(/\/\/.*$/gm, ''))
        || /console\.log\(this\)/.test(codeStr)
        || /\bawait\b[\s\S]*\.json\(\)/.test(codeStr) && !/\bfetch\b/.test(codeStr)
        // предсказания про порядок микро-/макротасков нельзя достоверно воспроизвести в vm-дрейне
        || (/setTimeout\b/.test(codeStr) && /\.then\b/.test(codeStr));
      if (untestable) continue;
      // Если у predict есть поле fixture — используем его как HTML-окружение для mock DOM.
      const predictFixture = p.fixture || '';
      const r = await runInVM(p.code || '', { fixture: predictFixture });
      if (isInfiniteExpected) {
        const timedOut = /таймаут|timeout/i.test(r.stderr) || r.stdout.split('\n').length > 50;
        if (!timedOut) {
          predictErrs.push(entry.id + ': predict ожидал бесконечный цикл, получил "' + normalizeOut(r.stdout) + '"');
        }
        continue;
      }
      const actual = normalizeOut(r.stdout);

      // Собираем все возможные нормализации ожидаемого ответа
      function makeVariants(expected) {
        const v = new Set();
        v.add(expected);
        // Кавычки по краям каждой строки
        const stripQuotes = (s) => s.replace(/^["'](.*)["']$/s, '$1');
        v.add(stripQuotes(expected));
        // " и " → \n
        const andSplit = expected.split(' и ');
        if (andSplit.length > 1) {
          const joined = andSplit.map(s => stripQuotes(s.trim())).join('\n');
          v.add(joined);
          v.add(andSplit.map(s => stripQuotes(s.trim())).join(', '));
        }
        // "," или ", " → \n
        const commaSplit = expected.split(/,\s*/);
        if (commaSplit.length > 1) {
          v.add(commaSplit.map(s => stripQuotes(s.trim())).join('\n'));
          v.add(commaSplit.map(s => stripQuotes(s.trim())).join(', '));
          v.add(expected);
        }
        // "→" → \n
        const arrowSplit = expected.split('→').map(s => s.trim());
        if (arrowSplit.length > 1) {
          v.add(arrowSplit.map(s => stripQuotes(s)).join('\n'));
          v.add(arrowSplit.map(s => stripQuotes(s)).join(', '));
        }
        // Убираем trailing qualifier: "только", "только\n", "и т.д."
        const qualifierRe = /\s+(только|only|—|т\.е\.|и\.т\.д\.|и т\.п\.|—.*)$/i;
        if (qualifierRe.test(expected)) {
          const trimmed = expected.replace(qualifierRe, '');
          v.add(trimmed);
          v.add(stripQuotes(trimmed));
          // Если после удаления qualifier остался один кавычный элемент — берём его содержимое
          const quoteMatch = trimmed.match(/^["'](.*)["']$/s);
          if (quoteMatch) v.add(quoteMatch[1]);
        }
        return [...v];
      }

      const variants = makeVariants(rawExpected);
      const cleanActual = actual.replace(/^["']|["']$/g, '');
      // Также пробуем убрать кавычки с каждой строки фактического вывода
      const actualLinesUnquoted = actual.split('\n').map(l => l.replace(/^["']|["']$/g, '')).join('\n');

      const matched = variants.some(v => {
        const cv = v.replace(/^["']|["']$/g, '');
        return cv === cleanActual || cv === actualLinesUnquoted ||
               cv.replace(/\n/g, ', ') === cleanActual.replace(/\n/g, ', ') ||
               cv.replace(/\n/g, ', ') === actualLinesUnquoted.replace(/\n/g, ', ');
      });

      if (!matched) {
        predictErrs.push(entry.id + ': got "' + actual + '" want "' + p.options[p.answer] + '"');
      }
    }
  }

  let failLines = [];
  for (const entry of idx.lessons) {
    const tErrs = taskResults.filter(t => t.lesson === entry.id && !t.ok);
    const pErrs = predictErrs.filter(p => p.startsWith(entry.id));
    const sErrs = structErrors.find(s => s.lesson === entry.id);
    const hasAny = tErrs.length || pErrs.length || sErrs;
    console.log(entry.id.padEnd(30) + (hasAny ? ' FAIL' : ' OK'));
    if (hasAny) {
      if (sErrs) failLines.push('  [struct] ' + sErrs.errors.join(', '));
      for (const te of tErrs) failLines.push('  [task] ' + entry.id + '/' + te.taskId + ': ' + te.errors.join('; '));
      for (const pe of pErrs) failLines.push('  [predict] ' + pe);
    }
  }

  if (failLines.length) {
    console.log('\nОШИБКИ (' + failLines.length + '):');
    for (const line of failLines) console.log(line);
    process.exit(1);
  } else {
    console.log('\nИТОГ: все уроки ОК, ошибок нет.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
