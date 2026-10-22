# Amber Learn

**Учебная платформа** — курс «JavaScript с нуля», 30 уроков.

Vanilla HTML/CSS/JS, оффлайн-PWA, IndexedDB, без бэкенда.

## Запуск

```bash
node serve.mjs [порт]  # по умолчанию 3000
# http://localhost:3000
```

## Структура

```
content/
  courses.json          — список курсов
  javascript/
    index.json          — индекс уроков (id, title, summary)
    01-intro-js.json    — урок 1
    02-variables.json   — урок 2
    ...
    30-project-todo.json — урок 30
js/
  highlighter.js        — подсветка кода (javascript)
scripts/
  app.js                — общие утилиты (toast, header, escapeHtml)
  auth.js               — аутентификация (IndexedDB)
  content.js            — загрузка контента (JSON)
  editor.js             — песочница (createPlayground)
  js-runner.js          — sandbox iframe (runJS)
  progress.js           — прогресс (IndexedDB)
  storage.js            — IndexedDB обёртка
styles/
  cyberpunk.css         — стили
  layout.css            — лейаут
service-worker.js       — PWA кэширование
```

## Схема урока (JSON)

```json
{
  "id": "javascript-01-intro-js",
  "title": "Введение в JavaScript",
  "goal": "Описание цели урока",
  "prereq": [],
  "duration": 20,
  "theory": [
    { "type": "hook", "content": "..." },
    { "type": "text", "content": "..." },
    { "type": "code", "content": "..." },
    { "type": "heading", "content": "..." },
    { "type": "predict", "code": "...", "question": "...", "options": [...], "answer": 0, "explain": "..." },
    { "type": "note", "content": "..." },
    { "type": "tip", "content": "..." },
    { "type": "warning", "content": "..." },
    { "type": "html", "content": "..." }
  ],
  "tasks": [
    {
      "id": "t1",
      "type": "guided",
      "prompt": "Описание задачи",
      "starter": "// стартовый код",
      "checks": [
        { "kind": "code-has", "pattern": "console\\\\.log", "message": "Используй console.log" },
        { "kind": "stdout-exact", "equals": "Hello", "message": "Вывод должен быть Hello" },
        { "kind": "no-error" }
      ],
      "hints": [
        "Подсказка 1 (намёк)",
        "Подсказка 2 (почти решение)"
      ],
      "solution": "// эталонный код",
      "fixture": "<div id='hello'>...</div>"
    }
  ],
  "recap": ["Ключевая мысль 1", "Ключевая мысль 2"],
  "quiz": [
    {
      "q": "Вопрос?",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explain": "Объяснение"
    }
  ]
}
```

### Поля урока

| Поле | Описание |
|------|----------|
| `id` | Уникальный ID (формат `javascript-NN-name`) |
| `title` | Название |
| `goal` | Цель урока |
| `prereq` | Массив prereq предыдущих уроков |
| `duration` | Примерная длительность (мин) |
| `theory` | Массив блоков (hook, text, code, heading, predict, note, tip, warning, html) |
| `tasks` | Массив задач (5 шт: guided → from-scratch → guided → debug → from-scratch) |
| `recap` | Ключевые мысли (3–6 пунктов) |
| `quiz` | Вопросы теста (3–5 шт) |

### Типы проверок задач

| kind | Описание |
|------|----------|
| `stdout` | Вывод содержит строку |
| `stdout-exact` | trim() вывода строго равен строке |
| `stdout-lines` | Массив строк, порядок строгий |
| `code-has` | Regex по исходному коду (без комментариев) |
| `code-not` | Regex, которого быть не должно |
| `var` | Сравнение значения из пробы |
| `has-call` | Вызов функции `имя(` |
| `has-template-literal` | Шаблонный литерал с `${}` |
| `no-error` | Нет ошибок в stderr |

## Как добавить урок

1. Добавьте запись в `content/javascript/index.json`
2. Создайте файл `content/javascript/NN-name.json` по схеме выше
3. Добавьте prereq в зависимости от предыдущих уроков

## Валидация

```bash
npm run validate
```

Запускает playwright-тесты: структурная проверка, решение проходит все проверки, starter не проходит, predict-блоки сверяются.

## PWA

Платформа работает оффлайн. Service worker использует:
- Precache для статики
- Stale-while-revalidate для JSON-контента
- Network-first для HTML
