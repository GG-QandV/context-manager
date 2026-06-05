# Аудит реального состояния vs HVOSTY_FIX_PLAN

> Дата аудита: 2026-06-05. Проверено по фактическому коду.

---

## Исправление HVOSTY_FIX_PLAN — что было неверно

### Блок 9 — .env config desync

| # | HVOSTY утверждал | Реальность | Статус |
|---|------------------|------------|--------|
| 9.1 | `EMBEDDING_PROVIDER=none` | Значение `huggingface-tei` ✅ | **HVOSTY ОШИБСЯ** |
| 9.2 | `EMBEDDING_DIMENSIONS=768` | Значение `384` ✅ | **HVOSTY ОШИБСЯ** |
| 9.3 | 4 мёртвых WEAVIATE_* vars | В .env их нет ✅ | **HVOSTY ОШИБСЯ** |
| 9.4 | PG_HOST/PORT только для сборки DATABASE_URL | **ВЕРНО** — но проблема глубже: `PG_HOST=postgresql-postgres-main-1` (Docker DNS) → DATABASE_URL сломан для нативного запуска | **VALID, другая формулировка** |

### Блок 10 — resync_qdrant.py порты

| # | HVOSTY утверждал | Реальность | Статус |
|---|------------------|------------|--------|
| 10.1 | `QDRANT_URL = "http://localhost:6334"` | Фактически `"http://localhost:6333"` ✅ | **HVOSTY ОШИБСЯ** |
| 10.2 | `PG_PORT` default = 5433 | Фактически `os.getenv("PG_PORT", "5432")` ✅ | **HVOSTY ОШИБСЯ** |
| 10.3 | PG_HOST default = localhost | Верно для дефолта, но .env переопределяет Docker DNS | **VALID** |

### Блок 11 — mcp.json template

| # | HVOSTY утверждал | Реальность | Статус |
|---|------------------|------------|--------|
| 11.1 | `{{MCP_SERVER_PATH}}` не подставлен | `mcp.json` содержит `"args": ["./mcp/server.js"]` — подставлен, но НЕВЕРНО (относительный путь) | **ЧАСТИЧНО ВЕРНО** |
| 11.2 | template не регенерируется | `mcp.json.template` существует, `init-mcp-config.mjs` его читает | **VALID** |

---

## Реальные баги для Windows-адаптации (найдены аудитом)

### GAP-1 — КРИТИЧЕСКИЙ: DATABASE_URL указывает на Docker DNS

**Файл:** `.env` строка ~12  
**Проблема:**
```env
PG_HOST=postgresql-postgres-main-1   # Docker container DNS name
DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DB}
# → postgresql://postgres:Mart436780@postgresql-postgres-main-1:5432/context_db
```
На нативном Windows это имя не резолвится → сервер падает при старте.

**Фикс:** Для нативного запуска нужен `.env.windows` с `PG_HOST=localhost`.

---

### GAP-2 — КРИТИЧЕСКИЙ: ONNX embedder отсутствует полностью

Нет кода, нет спеки, нет модели. TEI — единственный Linux-only blocker.  
**Фикс:** Написать `embed/embed_server.py` + скачать модель. См. `SPEC_ONNX_EMBEDDER.md`.

---

### GAP-3 — КРИТИЧЕСКИЙ: `models/` директории нет, нет скрипта загрузки

docker-compose монтирует `${MODELS_DIR:-./models}/multilingual-e5-small_Q8/onnx`.  
Директория в проекте отсутствует. Нет PowerShell скрипта для скачивания модели.  
**Фикс:** `scripts/download-model.ps1`.

---

### GAP-4 — ВЫСОКИЙ: `install.ps1` не покрывает native Windows стек

Текущий `install.ps1` делает только: проверка Node.js → `npm install` → `npm run build` → `init-mcp-config.mjs`.  
Не покрыты: PostgreSQL, Qdrant, Python, ONNX embedder, nssm, регистрация сервисов.  
**Фикс:** Расширить `install.ps1` или создать `install-native.ps1`.

---

### GAP-5 — ВЫСОКИЙ: `mcp.json` генерируется с относительным путём

`init-mcp-config.mjs` копирует server.js в `%APPDATA%/iflow/mcp/server.js`, но `mcp.json` генерируется с `args: ["<абсолютный путь>/server.js"]`.  
Текущий `mcp.json` (уже в repo) содержит `"./mcp/server.js"` — работает только при запуске из директории проекта.  
**Фикс:** При Windows-установке запустить `init-mcp-config.mjs` после `npm run build` (он сгенерирует правильный абсолютный путь через template).

---

### GAP-6 — СРЕДНИЙ: `mcp/server.js:6` хардкодит API_BASE

```javascript
const API_BASE = 'http://localhost:3847/api/context';  // не env-configurable
```
`cm_http_adapter.mjs` правильно читает `process.env.CM_API_BASE`, но `server.js` (stdio MCP) — нет.  
**Фикс:** Заменить на `process.env.CM_API_BASE || 'http://localhost:3847/api/context'`.

---

### GAP-7 — НИЗКИЙ: `cm_http_adapter.mjs` default CM_API_BASE

```javascript
const API_BASE = process.env.CM_API_BASE || 'http://localhost:3847/api/context';
```
Дефолт корректен для нативного Windows (localhost). В Docker-compose он переопределяется на `http://context-manager:3847/api/context`. **Проблем нет**, но нужно убедиться что nssm-сервис стартует с правильным env.

---

## Что в HVOSTY реально нужно делать

| Блок | Делать? | Приоритет |
|------|---------|-----------|
| 9.4 — PG_HOST в .env | Создать `.env.windows` | P0 |
| 11.2 — запускать init-mcp-config.mjs | В install pipeline | P0 |
| 12.x — type safety | Не блокирует Windows | P2 |
| 13.3 — `dist/` пересборка | Включить в install | P1 |
| 14.1 — пароль в .env | Не блокирует, локально OK | P3 |
| 15.x — stale git files | Cleanup, не блокирует | P3 |
| 16.4 — server.js hardcode | GAP-6, фикс нужен | P1 |
