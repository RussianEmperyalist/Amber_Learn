// Amber Learn — подсветка кода (javascript).
//
// Единый проход слева направо с приоритетом комментариев и строк.
// Поддерживает: комментарии // и блочные, строки '…', "…", `…` (многострочные с ${…}),
// ключевые слова, литералы, встроенные объекты, числа, имена функций перед (, оператор =>.
// Язык по умолчанию — javascript.
(function () {
  'use strict';

  // --- Регулярки для токенов JavaScript ---
  const KEYWORDS = [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'switch', 'case', 'default',
    'break', 'continue', 'for', 'while', 'do', 'class', 'extends', 'super',
    'new', 'this', 'try', 'catch', 'finally', 'throw', 'async', 'await',
    'import', 'export', 'from', 'of', 'in', 'typeof', 'instanceof', 'static', 'get', 'set',
  ];
  const KEYWORDS_RE = new RegExp('\\b(?:' + KEYWORDS.join('|') + ')\\b', 'g');

  const LITERALS = ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'];
  const LITERALS_RE = new RegExp('\\b(?:' + LITERALS.join('|') + ')\\b', 'g');

  const BUILTINS = [
    'console', 'Math', 'JSON', 'Promise', 'Array', 'Object', 'Number', 'String', 'Map', 'Set',
    'Date', 'RegExp', 'Error', 'document', 'window', 'fetch', 'setTimeout', 'setInterval',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  ];
  const BUILTINS_RE = new RegExp('\\b(?:' + BUILTINS.join('|') + ')\\b', 'g');

  // Единый проход слева направо: сначала комментарии и строки, потом остальное.
  function tokenize(code) {
    const tokens = [];
    let i = 0;
    const n = code.length;

    while (i < n) {
      const c = code[i];
      const c2 = code[i + 1];

      // 1. Однострочный комментарий
      if (c === '/' && c2 === '/') {
        let j = i + 2;
        while (j < n && code[j] !== '\n') j++;
        tokens.push({ type: 'comment', text: code.slice(i, j) });
        i = j;
        continue;
      }

      // 2. Многострочный комментарий
      if (c === '/' && c2 === '*') {
        let j = i + 2;
        while (j < n && !(code[j] === '*' && code[j + 1] === '/')) j++;
        j += 2;
        tokens.push({ type: 'comment', text: code.slice(i, j) });
        i = j;
        continue;
      }

      // 3. Строки '…', "…", `…`
      if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        let j = i + 1;
        while (j < n) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === quote) { j++; break; }
          j++;
        }
        tokens.push({ type: 'string', text: code.slice(i, j) });
        i = j;
        continue;
      }

      // 4. Числа (hex, float, sci notation, underscores)
      if (/\d/.test(c) || (c === '.' && /\d/.test(c2 || ''))) {
        let j = i;
        // hex
        if (c === '0' && (c2 === 'x' || c2 === 'X')) {
          j += 2;
          while (j < n && /[0-9a-fA-F_]/.test(code[j])) j++;
        } else {
          while (j < n && /[\d_]/.test(code[j])) j++;
          if (code[j] === '.') { j++; while (j < n && /[\d_]/.test(code[j])) j++; }
          if (code[j] === 'e' || code[j] === 'E') {
            j++;
            if (code[j] === '+' || code[j] === '-') j++;
            while (j < n && /\d/.test(code[j])) j++;
          }
        }
        tokens.push({ type: 'number', text: code.slice(i, j) });
        i = j;
        continue;
      }

      // 5. Идентификаторы (ключевые слова, литералы, встроенные, имена функций)
      if (/[a-zA-Z_$]/.test(c)) {
        let j = i;
        while (j < n && /[a-zA-Z0-9_$]/.test(code[j])) j++;
        const word = code.slice(i, j);

        if (KEYWORDS.includes(word)) {
          tokens.push({ type: 'keyword', text: word });
        } else if (LITERALS.includes(word)) {
          tokens.push({ type: 'boolean', text: word });
        } else if (BUILTINS.includes(word)) {
          tokens.push({ type: 'builtin', text: word });
        } else if (code[j] === '(') {
          // Имя функции перед (
          tokens.push({ type: 'function', text: word });
        } else {
          tokens.push({ type: 'plain', text: word });
        }
        i = j;
        continue;
      }

      // 6. Оператор => (стрелка)
      if (c === '=' && c2 === '>') {
        tokens.push({ type: 'operator', text: '=>' });
        i += 2;
        continue;
      }

      // 7. Операторы и пунктуация
      if (/[+\-*/%<>=!&|^~?:]/.test(c)) {
        let j = i + 1;
        while (j < n && /[+\-*/%<>=!&|^~?:]/.test(code[j])) j++;
        tokens.push({ type: 'operator', text: code.slice(i, j) });
        i = j;
        continue;
      }

      if (/[{}[\](),.;]/.test(c)) {
        tokens.push({ type: 'punctuation', text: c });
        i++;
        continue;
      }

      // 8. Пробелы/переносы
      if (/\s/.test(c)) {
        let j = i + 1;
        while (j < n && /\s/.test(code[j])) j++;
        tokens.push({ type: 'space', text: code.slice(i, j) });
        i = j;
        continue;
      }

      // 9. Прочее
      tokens.push({ type: 'plain', text: c });
      i++;
    }

    return tokens;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlight(code, lang) {
    if (lang === 'python' || lang === 'bash' || lang === 'yaml' || lang === 'dockerfile') {
      // Для не-JS языков — без подсветки
      return escapeHtml(code);
    }
    // JavaScript (default)
    const tokens = tokenize(code);
    return tokens.map(t => {
      if (t.type === 'space') return t.text;
      if (t.type === 'plain') return escapeHtml(t.text);
      return '<span class="token ' + t.type + '">' + escapeHtml(t.text) + '</span>';
    }).join('');
  }

  function highlightAll() {
    const blocks = document.querySelectorAll('pre code[class*="language-"]');
    blocks.forEach(function (block) {
      const langMatch = block.className.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : 'javascript';
      block.innerHTML = highlight(block.textContent, lang);
    });
  }

  window.AmberHighlighter = {
    highlight: highlight,
    highlightAll: highlightAll,
  };
})();
