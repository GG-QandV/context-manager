Отличная архитектура! Понял проблему — нужна **автоматизация RAG-пайплайна** для контекста между сессиями и подзадачами.

## Варианты решения:

### 1. **Wrapper-скрипт вокруг iFlow CLI**

```bash
#!/bin/bash
# iflow-wrapper.sh

PROJECT_DIR="$1"
TASK="$2"
SESSION_ID="${3:-$(uuidgen)}"

# 1. Читаем контекст перед заданием
CONTEXT=$(python3 scripts/get_context.py \
    --session "$SESSION_ID" \
    --task "$TASK" \
    --from-weaviate)

# 2. Формируем промпт с контекстом
FULL_PROMPT="
## Контекст из предыдущих сессий:
$CONTEXT

## Текущее задание:
$TASK
"

# 3. Запускаем iFlow
iflow run --dir "$PROJECT_DIR" --prompt "$FULL_PROMPT" | tee /tmp/iflow_output.log

# 4. Сохраняем результат
python3 scripts/save_context.py \
    --session "$SESSION_ID" \
    --task "$TASK" \
    --output /tmp/iflow_output.log \
    --to-postgres \
    --to-weaviate
```

---

### 2. **Python-оркестратор для многоэтапных задач**

```python
# orchestrator.py
import subprocess
import json
from datetime import datetime
from typing import List, Optional
import psycopg2
import weaviate

class IFlowOrchestrator:
    def __init__(self, project_dir: str):
        self.project_dir = project_dir
        self.session_id = self._generate_session_id()

        # Подключения
        self.pg = psycopg2.connect(
            host="localhost",
            database="iflow_context",
            user="postgres",
            password="password"
        )
        self.weaviate_client = weaviate.Client("http://localhost:8080")

    def run_pipeline(self, tasks: List[dict]):
        """
        Запуск многоэтапного задания
        tasks = [
            {"name": "analyze", "prompt": "Проанализируй структуру проекта"},
            {"name": "implement", "prompt": "Реализуй функцию X"},
            {"name": "test", "prompt": "Напиши тесты для функции X"}
        ]
        """
        pipeline_context = []

        for i, task in enumerate(tasks):
            print(f"\n{'='*50}")
            print(f"Этап {i+1}/{len(tasks)}: {task['name']}")
            print('='*50)

            # 1. Получаем релевантный контекст
            context = self._get_context(
                task_name=task['name'],
                previous_steps=pipeline_context
            )

            # 2. Формируем промпт
            full_prompt = self._build_prompt(task, context, pipeline_context)

            # 3. Запускаем iFlow
            result = self._run_iflow(full_prompt)

            # 4. Сохраняем результат
            self._save_context(task, result)

            # 5. Добавляем в контекст пайплайна
            pipeline_context.append({
                "step": i + 1,
                "task": task['name'],
                "summary": self._summarize(result),
                "output": result
            })

        return pipeline_context

    def _get_context(self, task_name: str, previous_steps: list) -> dict:
        """Получение контекста из Weaviate + PostgreSQL"""

        # Семантический поиск в Weaviate
        weaviate_results = self.weaviate_client.query\
            .get("TaskContext", ["task_name", "summary", "output", "timestamp"])\
            .with_near_text({"concepts": [task_name]})\
            .with_limit(5)\
            .do()

        # SQL поиск в PostgreSQL (последние похожие задачи)
        cursor = self.pg.cursor()
        cursor.execute("""
            SELECT task_name, summary, output, created_at
            FROM task_contexts
            WHERE task_name ILIKE %s
            ORDER BY created_at DESC
            LIMIT 5
        """, (f"%{task_name}%",))
        pg_results = cursor.fetchall()

        return {
            "semantic": weaviate_results,
            "historical": pg_results,
            "current_pipeline": previous_steps
        }

    def _build_prompt(self, task: dict, context: dict, pipeline_context: list) -> str:
        """Сборка промпта с контекстом"""

        prompt_parts = []

        # Контекст текущего пайплайна
        if pipeline_context:
            prompt_parts.append("## Предыдущие этапы текущего задания:")
            for step in pipeline_context[-3:]:  # Последние 3 шага
                prompt_parts.append(f"### Этап {step['step']}: {step['task']}")
                prompt_parts.append(f"{step['summary']}\n")

        # Релевантный контекст из базы
        if context.get('semantic', {}).get('data', {}).get('Get', {}).get('TaskContext'):
            prompt_parts.append("## Релевантный контекст из предыдущих сессий:")
            for item in context['semantic']['data']['Get']['TaskContext'][:3]:
                prompt_parts.append(f"- {item['task_name']}: {item['summary']}")

        # Текущее задание
        prompt_parts.append(f"\n## Текущее задание: {task['name']}")
        prompt_parts.append(task['prompt'])

        return "\n".join(prompt_parts)

    def _run_iflow(self, prompt: str) -> str:
        """Запуск iFlow CLI"""

        # Сохраняем промпт во временный файл
        with open('/tmp/iflow_prompt.txt', 'w') as f:
            f.write(prompt)

        # Запускаем iFlow (подстрой команду под твой CLI)
        result = subprocess.run(
            ['iflow', 'run', '--dir', self.project_dir, '--prompt-file', '/tmp/iflow_prompt.txt'],
            capture_output=True,
            text=True
        )

        return result.stdout

    def _save_context(self, task: dict, result: str):
        """Сохранение в PostgreSQL и Weaviate"""

        summary = self._summarize(result)
        timestamp = datetime.now().isoformat()

        # PostgreSQL
        cursor = self.pg.cursor()
        cursor.execute("""
            INSERT INTO task_contexts (session_id, task_name, prompt, output, summary, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (self.session_id, task['name'], task['prompt'], result, summary, timestamp))
        self.pg.commit()

        # Weaviate
        self.weaviate_client.data_object.create({
            "session_id": self.session_id,
            "task_name": task['name'],
            "prompt": task['prompt'],
            "output": result,
            "summary": summary,
            "timestamp": timestamp
        }, "TaskContext")

    def _summarize(self, text: str, max_length: int = 500) -> str:
        """Краткое саммари результата"""
        # Простой вариант - первые N символов
        # Можно заменить на вызов LLM для умного саммари
        return text[:max_length] + "..." if len(text) > max_length else text

    def _generate_session_id(self) -> str:
        import uuid
        return str(uuid.uuid4())


# Использование
if __name__ == "__main__":
    orchestrator = IFlowOrchestrator("/path/to/your/project")

    tasks = [
        {"name": "analyze", "prompt": "Проанализируй структуру API эндпоинтов"},
        {"name": "implement", "prompt": "Добавь новый эндпоинт /api/users/export"},
        {"name": "test", "prompt": "Напиши интеграционные тесты для /api/users/export"},
        {"name": "docs", "prompt": "Обнови документацию API"}
    ]

    results = orchestrator.run_pipeline(tasks)
```

---

### 3. **Схема таблиц PostgreSQL**

```sql
-- Основная таблица контекста
CREATE TABLE task_contexts (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    prompt TEXT,
    output TEXT,
    summary TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX idx_task_contexts_session ON task_contexts(session_id);
CREATE INDEX idx_task_contexts_task_name ON task_contexts(task_name);
CREATE INDEX idx_task_contexts_created ON task_contexts(created_at DESC);

-- Полнотекстовый поиск
CREATE INDEX idx_task_contexts_fts ON task_contexts 
    USING GIN (to_tsvector('russian', summary || ' ' || output));

-- Таблица связей между задачами (граф зависимостей)
CREATE TABLE task_relations (
    id SERIAL PRIMARY KEY,
    parent_task_id INT REFERENCES task_contexts(id),
    child_task_id INT REFERENCES task_contexts(id),
    relation_type VARCHAR(50) -- 'subtask', 'dependency', 'continuation'
);
```

---

### 4. **Weaviate Schema**

```python
# weaviate_schema.py

schema = {
    "class": "TaskContext",
    "vectorizer": "text2vec-transformers",  # или другой
    "moduleConfig": {
        "text2vec-transformers": {
            "model": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        }
    },
    "properties": [
        {"name": "session_id", "dataType": ["string"]},
        {"name": "task_name", "dataType": ["string"]},
        {"name": "prompt", "dataType": ["text"]},
        {"name": "output", "dataType": ["text"]},
        {"name": "summary", "dataType": ["text"]},
        {"name": "timestamp", "dataType": ["date"]},
        {"name": "tags", "dataType": ["string[]"]}
    ]
}
```

---

### 5. **Hooks для автоматизации (если iFlow поддерживает)**

```yaml
# .iflow/hooks.yml (гипотетический конфиг)

pre_task:
  - script: scripts/load_context.sh
    inject_to: prompt_prefix

post_task:
  - script: scripts/save_context.sh
    capture: output

context:
  postgres:
    enabled: true
    connection: postgresql://localhost/iflow_context
  weaviate:
    enabled: true
    url: http://localhost:8080
```

---

## Какой вариант ближе к твоему кейсу?

1. **Wrapper-скрипт** — если хочешь минимум изменений
2. **Python-оркестратор** — для полного контроля над пайплайном
3. **Hooks** — если iFlow поддерживает плагины/расширения

Расскажи подробнее про CLI команды iFlow — как именно ты его запускаешь? Тогда смогу точнее адаптировать решение.
