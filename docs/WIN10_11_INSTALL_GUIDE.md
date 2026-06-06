# Context Manager — Windows 10/11 Installation Guide

> Версия: 1.0 | Без Docker, без WSL

---

## Требования

| Требование | Минимум | Рекомендуется |
|-----------|---------|---------------|
| Windows | 10 (1909+) | 11 |
| RAM | 256 MB свободно | 512 MB |
| Диск | 500 MB | 1 GB |
| Node.js | 18.x | 22.x LTS |
| Python | 3.10 | 3.12 |
| PostgreSQL | 14 | 16 |

---

## Шаг 0: Предварительные требования

```powershell
# Установить winget если нет (обычно встроен в Win11)
# https://github.com/microsoft/winget-cli/releases

# Node.js
winget install OpenJS.NodeJS.LTS

# Python
winget install Python.Python.3.12

# nssm (service wrapper)
winget install nssm

# Перезапустить PowerShell для применения PATH
```

---

## Шаг 1: PostgreSQL

```powershell
# Вариант A — через winget
winget install PostgreSQL.PostgreSQL.16

# Вариант B — EDB installer (рекомендуется)
# Скачать с https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
# При установке:
#   - Port: 5432
#   - Password: задать свой (запомнить для DATABASE_URL)
#   - Locale: English

# Проверка
psql -U postgres -c "SELECT version();"
```

**Создать базу данных:**
```sql
-- В psql или pgAdmin
CREATE DATABASE context_db;
```

---

## Шаг 2: Qdrant

```powershell
# Скачать бинарник для Windows
# https://github.com/qdrant/qdrant/releases/latest
# Файл: qdrant-x86_64-pc-windows-msvc.zip

New-Item -ItemType Directory -Force -Path C:\qdrant\storage

# Распаковать qdrant.exe в C:\qdrant\

# Тест запуска
C:\qdrant\qdrant.exe

# Зарегистрировать как сервис
nssm install cm-qdrant "C:\qdrant\qdrant.exe"
nssm set cm-qdrant AppDirectory "C:\qdrant"
nssm set cm-qdrant AppStdout "C:\ProgramData\nssm\logs\cm-qdrant.log"
nssm set cm-qdrant AppStderr "C:\ProgramData\nssm\logs\cm-qdrant-err.log"
nssm set cm-qdrant Start SERVICE_AUTO_START
nssm start cm-qdrant

# Проверка
curl http://127.0.0.1:6333/health
```

---

## Шаг 3: Проект Context Manager

```powershell
# Клонировать или распаковать проект
# Предполагается: C:\context-manager\

cd C:\context-manager

# Создать директории
New-Item -ItemType Directory -Force -Path C:\ProgramData\nssm\logs

# Установить зависимости и собрать
npm install
npm run build

# Инициализировать MCP конфиг (генерирует mcp.json с правильными путями)
node scripts/init-mcp-config.mjs
```

---

## Шаг 4: Скачать ONNX модель

```powershell
# Установить huggingface_hub
pip install huggingface_hub

# Скачать модель
python -c "
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='intfloat/multilingual-e5-small',
    repo_type='model',
    local_dir=r'C:\context-manager\models\multilingual-e5-small_Q8\onnx',
    allow_patterns=['*.onnx', 'tokenizer*', 'config.json', 'special_tokens*', 'vocab*', '*.model']
)
print('Model downloaded.')
"

# Проверить наличие файлов
ls C:\context-manager\models\multilingual-e5-small_Q8\onnx\
# Должны быть: model*.onnx, tokenizer.json, tokenizer_config.json, config.json
```

---

## Шаг 5: ONNX Embedder

```powershell
# Создать директорию embedder
New-Item -ItemType Directory -Force -Path C:\context-manager\embed

# Скопировать файлы
Copy-Item C:\context-manager\embed\embed_server.py C:\context-manager\embed\
Copy-Item C:\context-manager\embed\requirements.txt C:\context-manager\embed\

# Установить Python зависимости
pip install -r C:\context-manager\embed\requirements.txt

# Тест запуска вручную
$env:MODEL_DIR = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
python C:\context-manager\embed\embed_server.py
# В другом терминале:
curl http://127.0.0.1:8080/health
curl -X POST http://127.0.0.1:8080/embed -H "Content-Type: application/json" -d '{"inputs":"test"}'
# Ctrl+C для остановки

# Зарегистрировать как сервис
nssm install cm-embed "C:\Python312\python.exe"
nssm set cm-embed AppParameters "-m uvicorn embed_server:app --host 127.0.0.1 --port 8080"
nssm set cm-embed AppDirectory "C:\context-manager\embed"
nssm set cm-embed AppEnvironmentExtra MODEL_DIR=C:\context-manager\models\multilingual-e5-small_Q8\onnx
nssm set cm-embed AppStdout "C:\ProgramData\nssm\logs\cm-embed.log"
nssm set cm-embed AppStderr "C:\ProgramData\nssm\logs\cm-embed-err.log"
nssm set cm-embed Start SERVICE_AUTO_START
nssm start cm-embed
```

---

## Шаг 6: Конфигурация .env

```powershell
# Скопировать Windows конфиг
Copy-Item C:\context-manager\.env.example C:\context-manager\.env

# Отредактировать .env — заменить DATABASE_URL:
notepad C:\context-manager\.env
```

**Обязательно заменить в `.env`:**
```env
DATABASE_URL=postgresql://postgres:YOURPASSWORD@localhost:5432/context_db
```

**Проверить что остальные переменные верны:**
```env
QDRANT_HOST=localhost
TEI_HOST=http://127.0.0.1:8080
EMBEDDING_PROVIDER=huggingface-tei
EMBEDDING_DIMENSIONS=384
HOST=127.0.0.1
PORT=3847
```

---

## Шаг 7: Инициализация базы данных

```powershell
cd C:\context-manager
node dist/index.js
# Дождаться строки "Fastify listening on 127.0.0.1:3847"
# Ctrl+C — теперь регистрируем как сервис
```

---

## Шаг 8: Context Manager как сервис

```powershell
# Получить ваш DATABASE_URL
$dbUrl = "postgresql://postgres:YOURPASSWORD@localhost:5432/context_db"

nssm install cm-api "C:\Program Files\nodejs\node.exe"
nssm set cm-api AppParameters "dist\index.js"
nssm set cm-api AppDirectory "C:\context-manager"
nssm set cm-api AppEnvironmentExtra DATABASE_URL=$dbUrl
nssm set cm-api AppEnvironmentExtra QDRANT_HOST=localhost
nssm set cm-api AppEnvironmentExtra QDRANT_PORT=6333
nssm set cm-api AppEnvironmentExtra TEI_HOST=http://127.0.0.1:8080
nssm set cm-api AppEnvironmentExtra EMBEDDING_PROVIDER=huggingface-tei
nssm set cm-api AppEnvironmentExtra EMBEDDING_DIMENSIONS=384
nssm set cm-api AppEnvironmentExtra PORT=3847
nssm set cm-api AppEnvironmentExtra HOST=127.0.0.1
nssm set cm-api AppStdout "C:\ProgramData\nssm\logs\cm-api.log"
nssm set cm-api AppStderr "C:\ProgramData\nssm\logs\cm-api-err.log"
nssm set cm-api Start SERVICE_AUTO_START
nssm start cm-api
```

---

## Шаг 9: MCP HTTP Adapter как сервис

```powershell
nssm install cm-mcp "C:\Program Files\nodejs\node.exe"
nssm set cm-mcp AppParameters "cm_http_adapter.mjs"
nssm set cm-mcp AppDirectory "C:\context-manager\mcp"
nssm set cm-mcp AppEnvironmentExtra CM_API_BASE=http://127.0.0.1:3847/api/context
nssm set cm-mcp AppEnvironmentExtra CM_MCP_PORT=8770
nssm set cm-mcp AppStdout "C:\ProgramData\nssm\logs\cm-mcp.log"
nssm set cm-mcp AppStderr "C:\ProgramData\nssm\logs\cm-mcp-err.log"
nssm set cm-mcp Start SERVICE_AUTO_START
nssm start cm-mcp
```

---

## Шаг 10: Watchdog как сервис

```powershell
# watchdog_cm.py должен быть в C:\context-manager\embed\
nssm install cm-watchdog "C:\Python312\python.exe"
nssm set cm-watchdog AppParameters "watchdog_cm.py"
nssm set cm-watchdog AppDirectory "C:\context-manager\embed"
nssm set cm-watchdog AppStdout "C:\ProgramData\nssm\logs\cm-watchdog.log"
nssm set cm-watchdog AppStderr "C:\ProgramData\nssm\logs\cm-watchdog-err.log"
nssm set cm-watchdog Start SERVICE_AUTO_START
nssm start cm-watchdog
```

---

## Шаг 11: Smoke tests

```powershell
# 1. PostgreSQL
psql -U postgres -d context_db -c "SELECT COUNT(*) FROM context_sessions;" 2>$null && echo "PG OK"

# 2. Qdrant
curl http://127.0.0.1:6333/health

# 3. ONNX Embedder
curl http://127.0.0.1:8080/health
curl -X POST http://127.0.0.1:8080/embed -H "Content-Type: application/json" -d '{"inputs":"test"}'

# 4. Context Manager
curl http://127.0.0.1:3847/health

# 5. Context Manager health (реальный ответ: status=healthy|degraded, а не ok)
curl http://127.0.0.1:3847/health
# Ожидается: {"status":"healthy","postgresql":"connected","qdrant":"connected",...}

# 6. MCP HTTP Adapter
curl http://127.0.0.1:8770/mcp -H "Content-Type: application/json" `
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 7. Все сервисы nssm
nssm status cm-qdrant
nssm status cm-embed
nssm status cm-api
nssm status cm-mcp
nssm status cm-watchdog
```

---

## Настройка MCP в IDE

**Для Cursor / Claude Desktop / VS Code:**

После `node scripts/init-mcp-config.mjs` файл `mcp.json` будет содержать абсолютный путь к `server.js`.

Скопировать конфиг в нужное место IDE:
```powershell
# Claude Desktop
Copy-Item C:\context-manager\mcp.json "$env:APPDATA\Claude\claude_desktop_config.json"

# Cursor
# Открыть Settings → MCP → добавить из mcp.json
```

**Ручная конфигурация (если init-mcp-config.mjs не сработал):**
```json
{
  "servers": {
    "context-manager": {
      "type": "stdio",
      "command": "node",
      "args": ["%APPDATA%\\iflow\\mcp\\server.js"]
    }
  }
}
```

---

## Управление сервисами

```powershell
# Статус всех
nssm status cm-qdrant; nssm status cm-embed; nssm status cm-api; nssm status cm-mcp

# Рестарт конкретного
nssm restart cm-api

# Остановить всё
nssm stop cm-watchdog; nssm stop cm-mcp; nssm stop cm-api; nssm stop cm-embed; nssm stop cm-qdrant

# Удалить все сервисы (при деинсталляции)
foreach ($s in @("cm-watchdog","cm-mcp","cm-api","cm-embed","cm-qdrant")) {
    nssm stop $s 2>$null
    nssm remove $s confirm
}
```

---

## Логи

```powershell
# Смотреть логи в реальном времени
Get-Content C:\ProgramData\nssm\logs\cm-api.log -Wait -Tail 50
Get-Content C:\ProgramData\nssm\logs\cm-embed.log -Wait -Tail 50
Get-Content C:\ProgramData\nssm\logs\cm-watchdog.log -Wait -Tail 50
```

---

## Диагностика типичных проблем

| Симптом | Причина | Решение |
|---------|---------|---------|
| `cm-api` не стартует | Неверный DATABASE_URL | Проверить пароль и имя БД в nssm env |
| `curl :3847/health` → `pg: disconnected` | PostgreSQL не запущен | `net start postgresql-x64-16` |
| `curl :8080/health` → 503 | Модель не загружена | Проверить MODEL_DIR в nssm env |
| `curl :8080/health` → connection refused | cm-embed не стартовал | `nssm status cm-embed`, смотреть лог |
| Qdrant ошибка коллекции | Первый запуск, коллекция не создана | Context Manager создаёт её автоматически |
| MCP tools не видны в IDE | mcp.json путь неверный | Запустить `init-mcp-config.mjs` заново |
