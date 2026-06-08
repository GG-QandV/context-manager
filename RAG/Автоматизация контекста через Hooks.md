> ⚠️ **HISTORICAL DOCUMENT — for reference only**
>
> This document describes the original iFlow-based architecture. The project has since been renamed to Context Manager with new paths and stack.
>
> **Current paths:** `~/.context-manager/` (all platforms)
> **Current stack:** PostgreSQL + Qdrant + ONNX (not Weaviate)
>
> See `README.md` for current installation and usage.

> **NOTE 2026-06-04:** Все пути `~/.iflow/` в этом документе — устаревшие.
> Актуальное расположение конфигов:
> - **Linux:** `~/.config/iflow/`
> - **macOS:** `~/Library/Application Support/iflow/`
> - **Windows:** `%APPDATA%/iflow/`
> Миграция со старого пути выполняется автоматически при старте сервера.

Отлично! Теперь всё понятно! iFlow CLI — это мощный инструмент с системой субагентов и **hooks**. Это ключ к твоей автоматизации!

---

## Решение: Автоматизация контекста через Hooks

### 1. **Настройка hooks в `settings.json`**

```json
{
  "modelName": "Qwen3-Coder",
  "enableBuiltInTask": true,
  "hookManager": true,
  "tokenBudget": 2000,

  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "python3 ~/.iflow/scripts/load_context.py --session-id $IFLOW_SESSION_ID --project-dir $PWD"
      }
    ],
    "TaskStart": [
      {
        "type": "command", 
        "command": "python3 ~/.iflow/scripts/load_task_context.py --task '$IFLOW_TASK_NAME' --project-dir $PWD"
      }
    ],
    "SubagentStop": [
      {
        "type": "command",
        "command": "python3 ~/.iflow/scripts/save_context.py --session-id $IFLOW_SESSION_ID --task '$IFLOW_TASK_NAME' --output-file /tmp/iflow_last_output.log"
      }
    ],
    "SessionEnd": [
      {
        "type": "command",
        "command": "python3 ~/.iflow/scripts/finalize_session.py --session-id $IFLOW_SESSION_ID"
      }
    ]
  },

  "mcps": {
    "postgres-context": {
      "command": "node",
      "args": ["~/.iflow/mcp/postgres-context-server.js"],
      "env": {
        "PG_CONNECTION": "postgresql://localhost/iflow_context"
      }
    },
    "weaviate-context": {
      "command": "python3",
      "args": ["~/.iflow/mcp/weaviate_context_server.py"],
      "env": {
        "WEAVIATE_URL": "http://localhost:8080"
      }
    }
  }
}
```

---

### 2. **Скрипты для hooks**

#### `~/.iflow/scripts/load_context.py` (при старте сессии)

```python
#!/usr/bin/env python3
"""Загрузка контекста при старте сессии"""

import argparse
import json
import psycopg2
import weaviate
import os
from pathlib import Path

def get_postgres_connection():
    return psycopg2.connect(
        host=os.getenv("PG_HOST", "localhost"),
        database=os.getenv("PG_DATABASE", "iflow_context"),
        user=os.getenv("PG_USER", "postgres"),
        password=os.getenv("PG_PASSWORD", "password")
    )

def get_weaviate_client():
    return weaviate.Client(os.getenv("WEAVIATE_URL", "http://localhost:8080"))

def load_context(session_id: str, project_dir: str) -> dict:
    """Загружает релевантный контекст для текущей сессии"""

    context = {
        "previous_sessions": [],
        "project_context": [],
        "semantic_matches": []
    }

    # 1. PostgreSQL: последние сессии этого проекта
    pg = get_postgres_connection()
    cursor = pg.cursor()

    cursor.execute("""
        SELECT session_id, task_name, summary, created_at
        FROM task_contexts
        WHERE project_dir = %s
        ORDER BY created_at DESC
        LIMIT 10
    """, (project_dir,))

    for row in cursor.fetchall():
        context["previous_sessions"].append({
            "session_id": row[0],
            "task": row[1],
            "summary": row[2],
            "date": row[3].isoformat() if row[3] else None
        })

    # 2. Weaviate: семантический поиск по названию проекта
    wv = get_weaviate_client()
    project_name = Path(project_dir).name

    try:
        result = wv.query\
            .get("TaskContext", ["task_name", "summary", "output"])\
            .with_near_text({"concepts": [project_name]})\
            .with_limit(5)\
            .do()

        if result.get("data", {}).get("Get", {}).get("TaskContext"):
            context["semantic_matches"] = result["data"]["Get"]["TaskContext"]
    except Exception as e:
        print(f"Weaviate query failed: {e}")

    # 3. Записываем контекст в файл для iFlow
    context_file = Path("/tmp/iflow_context.json")
    context_file.write_text(json.dumps(context, indent=2, ensure_ascii=False))

    # 4. Создаем summary для инъекции в промпт
    summary_file = Path("/tmp/iflow_context_summary.md")
    summary = generate_summary(context)
    summary_file.write_text(summary)

    print(f"✓ Контекст загружен: {len(context['previous_sessions'])} сессий, {len(context['semantic_matches'])} семантических совпадений")

    return context

def generate_summary(context: dict) -> str:
    """Генерирует markdown-summary для промпта"""

    lines = ["## 📚 Контекст из предыдущих сессий\n"]

    if context["previous_sessions"]:
        lines.append("### Последние задачи в этом проекте:")
        for s in context["previous_sessions"][:5]:
            lines.append(f"- **{s['task']}** ({s['date'][:10] if s['date'] else 'N/A'})")
            if s['summary']:
                lines.append(f"  > {s['summary'][:200]}...")
        lines.append("")

    if context["semantic_matches"]:
        lines.append("### Релевантный опыт из других проектов:")
        for m in context["semantic_matches"][:3]:
            lines.append(f"- {m.get('task_name', 'Unknown')}: {m.get('summary', '')[:150]}...")
        lines.append("")

    return "\n".join(lines)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--project-dir", required=True)
    args = parser.parse_args()

    load_context(args.session_id, args.project_dir)
```

---

#### `~/.iflow/scripts/save_context.py` (после каждого субагента)

```python
#!/usr/bin/env python3
"""Сохранение контекста после выполнения задачи"""

import argparse
import json
import psycopg2
import weaviate
import os
import hashlib
from datetime import datetime
from pathlib import Path

def get_postgres_connection():
    return psycopg2.connect(
        host=os.getenv("PG_HOST", "localhost"),
        database=os.getenv("PG_DATABASE", "iflow_context"),
        user=os.getenv("PG_USER", "postgres"),
        password=os.getenv("PG_PASSWORD", "password")
    )

def get_weaviate_client():
    return weaviate.Client(os.getenv("WEAVIATE_URL", "http://localhost:8080"))

def extract_summary(output: str, max_length: int = 500) -> str:
    """Извлекает ключевую информацию из вывода"""

    # Ищем структурированные блоки
    key_markers = [
        "## Результат", "## Summary", "## Итог",
        "✓", "✅", "Done:", "Completed:"
    ]

    lines = output.split("\n")
    summary_lines = []

    for i, line in enumerate(lines):
        # Захватываем строки после ключевых маркеров
        for marker in key_markers:
            if marker in line:
                summary_lines.extend(lines[i:i+5])
                break

    if summary_lines:
        return "\n".join(summary_lines)[:max_length]

    # Fallback: первые N символов
    return output[:max_length]

def save_context(session_id: str, task_name: str, output_file: str, project_dir: str):
    """Сохраняет результат задачи в PostgreSQL и Weaviate"""

    # Читаем вывод
    output_path = Path(output_file)
    if not output_path.exists():
        print(f"⚠ Output file not found: {output_file}")
        return

    output = output_path.read_text()
    summary = extract_summary(output)
    timestamp = datetime.now()

    # Генерируем уникальный ID для дедупликации
    content_hash = hashlib.md5(f"{session_id}{task_name}{output[:500]}".encode()).hexdigest()

    # 1. PostgreSQL
    pg = get_postgres_connection()
    cursor = pg.cursor()

    # Проверяем дубликаты
    cursor.execute("SELECT id FROM task_contexts WHERE content_hash = %s", (content_hash,))
    if cursor.fetchone():
        print(f"⚠ Дубликат, пропускаем: {task_name}")
        return

    cursor.execute("""
        INSERT INTO task_contexts 
        (session_id, task_name, output, summary, project_dir, content_hash, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (session_id, task_name, output, summary, project_dir, content_hash, timestamp))

    record_id = cursor.fetchone()[0]
    pg.commit()

    # 2. Weaviate
    wv = get_weaviate_client()

    try:
        wv.data_object.create({
            "session_id": session_id,
            "task_name": task_name,
            "output": output[:10000],  # Лимит для векторизации
            "summary": summary,
            "project_dir": project_dir,
            "timestamp": timestamp.isoformat()
        }, "TaskContext")

        print(f"✓ Контекст сохранен: {task_name} (id={record_id})")
    except Exception as e:
        print(f"⚠ Weaviate save failed: {e}")
        # PostgreSQL уже сохранен, не критично

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--task", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--project-dir", default=os.getcwd())
    args = parser.parse_args()

    save_context(args.session_id, args.task, args.output_file, args.project_dir)
```

---

### 3. **Кастомный агент для работы с контекстом**

Создай файл `~/.iflow/agents/context-manager.md`:

```yaml
---
agentType: "context-manager"
name: "Context Manager"
systemPrompt: |
  Ты — агент управления контекстом проекта. Твои задачи:

  1. Поиск релевантной информации из предыдущих сессий
  2. Суммаризация выполненных задач
  3. Построение связей между задачами
  4. Рекомендации на основе истории проекта

  У тебя есть доступ к PostgreSQL и Weaviate через MCP.

  При запросе контекста:
  - Используй семантический поиск в Weaviate для похожих задач
  - Используй PostgreSQL для точного поиска по датам/именам
  - Комбинируй результаты для полной картины

whenToUse: "Когда нужно найти информацию из прошлых сессий, построить контекст или проанализировать историю задач"
model: "Qwen3-Coder"
allowedTools: ["Read", "Bash"]
allowedMcps: ["postgres-context", "weaviate-context"]
isInheritTools: false
isInheritMcps: false
color: "purple"
---

# Context Manager Agent

Этот агент помогает управлять контекстом между сессиями iFlow.

## Примеры использования:
- "Найди все задачи связанные с авторизацией"
- "Что мы делали на прошлой неделе?"
- "Какие баги были исправлены в модуле users?"
```

---

### 4. **MCP-сервер для PostgreSQL контекста**

`~/.iflow/mcp/postgres-context-server.js`:

```javascript
#!/usr/bin/env node

const { Server } = require('@anthropic-ai/mcp');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION || 'postgresql://localhost/iflow_context'
});

const server = new Server({
  name: 'postgres-context',
  version: '1.0.0'
});

// Tool: Поиск по задачам
server.addTool({
  name: 'search_tasks',
  description: 'Поиск задач в истории по ключевым словам',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Поисковый запрос' },
      limit: { type: 'number', default: 10 }
    },
    required: ['query']
  },
  handler: async ({ query, limit = 10 }) => {
    const result = await pool.query(`
      SELECT task_name, summary, created_at, project_dir
      FROM task_contexts
      WHERE to_tsvector('russian', task_name || ' ' || summary || ' ' || output) 
            @@ plainto_tsquery('russian', $1)
      ORDER BY created_at DESC
      LIMIT $2
    `, [query, limit]);

    return result.rows;
  }
});

// Tool: Получить последние задачи
server.addTool({
  name: 'get_recent_tasks',
  description: 'Получить последние N задач для проекта',
  parameters: {
    type: 'object',
    properties: {
      project_dir: { type: 'string' },
      limit: { type: 'number', default: 10 }
    }
  },
  handler: async ({ project_dir, limit = 10 }) => {
    const result = await pool.query(`
      SELECT task_name, summary, created_at
      FROM task_contexts
      WHERE project_dir = $1 OR $1 IS NULL
      ORDER BY created_at DESC
      LIMIT $2
    `, [project_dir, limit]);

    return result.rows;
  }
});

// Tool: Получить контекст сессии
server.addTool({
  name: 'get_session_context',
  description: 'Получить все задачи конкретной сессии',
  parameters: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'UUID сессии' }
    },
    required: ['session_id']
  },
  handler: async ({ session_id }) => {
    const result = await pool.query(`
      SELECT task_name, summary, output, created_at
      FROM task_contexts
      WHERE session_id = $1
      ORDER BY created_at ASC
    `, [session_id]);

    return result.rows;
  }
});

server.start();
```

---

### 5. **Использование в iFlow**

Теперь можешь работать так:

```bash
# Старт сессии — контекст загружается автоматически через hook
iflow

# Запрос с автоматическим контекстом
> $code-reviewer Проверь эндпоинт /api/users на безопасность

# Результат автоматически сохраняется через SubagentStop hook

# Следующая задача видит предыдущий контекст
> $backend-dev Исправь найденные проблемы безопасности

# Явный запрос контекста через кастомного агента
> $context-manager Найди все задачи связанные с авторизацией за последний месяц

# Многоэтапный пайплайн
> $code-reviewer Проверь src/
> $test-generator Напиши тесты для найденных проблем
> $doc-writer Задокументируй изменения
```

---

### 6. **SQL-схема для PostgreSQL**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE task_contexts (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    output TEXT,
    summary TEXT,
    project_dir VARCHAR(500),
    content_hash VARCHAR(32) UNIQUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_task_session ON task_contexts(session_id);
CREATE INDEX idx_task_project ON task_contexts(project_dir);
CREATE INDEX idx_task_created ON task_contexts(created_at DESC);
CREATE INDEX idx_task_hash ON task_contexts(content_hash);

-- Полнотекстовый поиск
CREATE INDEX idx_task_fts ON task_contexts 
    USING GIN (to_tsvector('russian', coalesce(task_name,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(output,'')));

-- Триграммный поиск для fuzzy matching
CREATE INDEX idx_task_trgm ON task_contexts 
    USING GIN (task_name gin_trgm_ops);
```

---

## Итого

| Компонент      | Файл                                      | Назначение                     |
| -------------- | ----------------------------------------- | ------------------------------ |
| Hooks config   | `~/.iflow/settings.json`                  | Автоматический запуск скриптов |
| Load context   | `~/.iflow/scripts/load_context.py`        | Загрузка при старте            |
| Save context   | `~/.iflow/scripts/save_context.py`        | Сохранение после задач         |
| Context agent  | `~/.iflow/agents/context-manager.md`      | Явная работа с контекстом      |
| MCP PostgreSQL | `~/.iflow/mcp/postgres-context-server.js` | API для базы данных            |

Хочешь, чтобы я детальнее расписал какой-то компонент или помог с Weaviate MCP-сервером?
