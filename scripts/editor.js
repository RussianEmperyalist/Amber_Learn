/**
 * Amber Learn — JS Playground (editor + runner).
 */

import { runJS } from './js-runner.js?v=5';
import { toast } from './app.js?v=5';
import { storage } from './storage.js?v=5';

const CHECKS_SCHEMA = [
  'stdout', 'stdout-exact', 'stdout-lines', 'stdout-match',
  'code-has', 'code-not', 'var', 'has-call', 'has-template-literal', 'no-error',
];

export async function createPlayground(mountElement, opts) {
  const { starter = '', checks = [], onPass, fixture, solution = '', userId, taskId } = opts;

  let initialCode = starter;
  if (userId && taskId) {
    try {
      const draft = await storage.getDraft(userId, taskId);
      if (draft && typeof draft.code === 'string') initialCode = draft.code;
    } catch (e) { }
  }

  mountElement.innerHTML = `
    <div class="playground">
      <textarea class="playground-textarea" id="code-editor" spellcheck="false">${escapeHtml(initialCode)}</textarea>
      <div class="playground-actions">
        <button class="btn btn-primary" id="runBtn">Проверить</button>
        <button class="btn btn-ghost" id="resetBtn">Сбросить</button>
        <button class="btn btn-ghost" id="clearBtn">Очистить</button>
        ${solution ? '<button class="btn btn-ghost" id="solutionBtn">Показать решение</button>' : ''}
        <span class="status" id="runStatus"></span>
      </div>
      <pre class="playground-output" id="output" style="display:none; background:var(--code-bg); border:1px solid var(--border); border-radius:4px; padding:12px; margin-top:8px; font-family:var(--font-mono); font-size:0.85rem; color:var(--code-text); white-space:pre-wrap; max-height:300px; overflow-y:auto;"></pre>
      ${solution ? '<pre class="playground-output" id="solutionOutput" style="display:none; background:var(--code-bg); border:1px solid var(--border); border-radius:4px; padding:12px; margin-top:8px; font-family:var(--font-mono); font-size:0.85rem; color:var(--code-text); white-space:pre-wrap; max-height:300px; overflow-y:auto;"></pre>' : ''}
    </div>
  `;

  const editor = mountElement.querySelector('#code-editor');
  const runBtn = mountElement.querySelector('#runBtn');
  const resetBtn = mountElement.querySelector('#resetBtn');
  const clearBtn = mountElement.querySelector('#clearBtn');
  const solutionBtn = mountElement.querySelector('#solutionBtn');
  const solutionOutput = mountElement.querySelector('#solutionOutput');
  const status = mountElement.querySelector('#runStatus');
  const output = mountElement.querySelector('#output');

  // Автосохранение черновика с дебаунсом 500мс
  let draftTimer = null;
  function scheduleDraftSave() {
    if (!userId || !taskId) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      storage.saveDraft(userId, taskId, editor.value).catch(() => {});
    }, 500);
  }
  editor.addEventListener('input', scheduleDraftSave);

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 4;
    }
  });

  clearBtn.addEventListener('click', () => {
    editor.value = '';
    scheduleDraftSave();
    output.style.display = 'none';
    output.textContent = '';
    status.textContent = '';
  });

  resetBtn.addEventListener('click', () => {
    editor.value = starter;
    scheduleDraftSave();
    output.style.display = 'none';
    output.textContent = '';
    status.textContent = '';
  });

  if (solutionBtn && solutionOutput) {
    solutionBtn.addEventListener('click', () => {
      const expanded = solutionBtn.getAttribute('aria-expanded') === 'true';
      solutionBtn.setAttribute('aria-expanded', !expanded);
      solutionOutput.style.display = expanded ? 'none' : 'block';
      if (!expanded) {
        solutionOutput.innerHTML = solutionOutput.querySelector('.placeholder')
          ? escapeHtml(solution)
          : escapeHtml(solution);
        if (window.AmberHighlighter) window.AmberHighlighter.highlight(solutionOutput);
      }
      solutionBtn.textContent = expanded ? 'Показать решение' : 'Скрыть решение';
    });
  }

  runBtn.addEventListener('click', async () => {
    const code = editor.value;
    runBtn.disabled = true;
    runBtn.textContent = 'Запуск...';
    status.textContent = '';

    try {
      const result = await runJS(code, { fixture });
      const evals = evaluateChecks(code, result, checks);
      const allPassed = evals.every((e) => e.pass);

      if (result.stderr && !allPassed) {
        output.style.display = 'block';
        output.innerHTML = `<span style="color:var(--red);">Ошибка: ${escapeHtml(result.stderr)}</span>`;
      } else {
        output.style.display = 'block';
        const stdout = result.stdout.trim() ? escapeHtml(result.stdout.trim()) : '(нет вывода)';
        output.innerHTML = `<span style="color:var(--green);">Вывод:</span>\n${stdout}`;
      }

      if (allPassed) {
        status.innerHTML = '<span style="color:var(--green);">✓ Все проверки пройдены!</span>';
        toast('Задача решена ✓', 'success');
        if (onPass) onPass();
      } else {
        const failed = evals.filter((e) => !e.pass);
        const msgs = failed.map((f) => escapeHtml(f.message || f.kind));
        status.innerHTML = `<span style="color:var(--yellow);">✗ ${msgs.join('; ')}</span>`;
      }
    } catch (e) {
      output.style.display = 'block';
      output.innerHTML = `<span style="color:var(--red);">Ошибка выполнения: ${escapeHtml(e.message)}</span>`;
      status.textContent = '✗ Ошибка';
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Проверить';
    }
  });
}

function evaluateChecks(code, result, checks) {
  if (!checks.length) return [{ kind: 'none', pass: true, message: '' }];
  const results = [];
  const codeNoComments = code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n/g, ' ')
    .trim();

  for (const check of checks) {
    const kind = check.kind || 'stdout';
    let pass = false;
    let message = check.message || null;

    switch (kind) {
      case 'stdout': {
        const needle = String(check.equals ?? check.value ?? '');
        pass = result.stdout.includes(needle);
        message = message || `Вывод не содержит «${needle}»`;
        break;
      }
      case 'stdout-exact': {
        const needle = String(check.equals ?? check.value ?? '');
        const normalized = result.stdout.trim().replace(/\r\n/g, '\n');
        pass = normalized === needle;
        message = message || `Ожидался вывод «${needle}» (строго)`;
        break;
      }
      case 'stdout-lines': {
        const expected = Array.isArray(check.lines) ? check.lines : [];
        const lines = result.stdout.trim().replace(/\r\n/g, '\n').split('\n');
        pass = lines.length === expected.length && lines.every((l, i) => l === expected[i]);
        message = message || `Ожидаемые строки: ${expected.join(', ')}`;
        break;
      }
      case 'stdout-match': {
        const regex = new RegExp(check.equals || check.value || '');
        pass = regex.test(result.stdout);
        message = message || `Вывод не соответствует ${regex}`;
        break;
      }
      case 'code-has': {
        try {
          const regex = new RegExp(check.pattern || check.equals || check.value || '');
          pass = regex.test(codeNoComments);
           message = message || `В коде не найдена проверка «${check.pattern || check.equals || check.value}»`;
         } catch (e) {
           pass = false;
           message = `Неверный regex в code-has: ${check.pattern || check.equals || check.value}`;
        }
        break;
      }
      case 'code-not': {
        try {
          const regex = new RegExp(check.pattern || check.equals || check.value || '');
          pass = !regex.test(codeNoComments);
           message = message || `В коде найдено запрещённое: «${check.pattern || check.equals || check.value}»`;
         } catch (e) {
           pass = false;
           message = `Неверный regex в code-not: ${check.pattern || check.equals || check.value}`;
        }
        break;
      }
      case 'var': {
        const varName = check.name;
        const expected = check.equals ?? check.value;
        const actual = result.vars[varName];
        pass = (expected === '' && actual === '') || (expected === 0 && actual === 0) ||
               (expected === null && actual === null) || (expected === undefined && actual === undefined) ||
               String(actual) === String(expected);
        message = message || `Переменная «${varName}» не совпадает`;
        break;
      }
      case 'has-call': {
        const fnName = check.name || check.equals || check.value;
        const escaped = escapeRegExp(fnName);
        const callRegex = new RegExp(`\\b${escaped}\\s*\\(`);
        pass = callRegex.test(code);
        message = message || `Вызов «${fnName}()» не найден`;
        break;
      }
      case 'has-template-literal': {
        const regex = /`(?:[^`\\]|\\[\s\S])*?\$\{[^}]+\}(?:[^`\\]|\\[\s\S])*?`/;
        pass = regex.test(code);
        message = message || `Шаблонный литерал с ${'}'} не найден`;
        break;
      }
      case 'no-error': {
        pass = !result.stderr;
        message = message || `Ожидалось отсутствие ошибок`;
        break;
      }
      default:
        results.push({ kind, pass: false, message: `Неизвестная проверка «${kind}»` });
        continue;
    }
    results.push({ kind, pass, message });
  }
  return results;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
