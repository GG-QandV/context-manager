# Задание: Windows 10/11 Native Implementation

> Основание: аудит кода 2026-06-05 + спеки v1.0  
> Спеки: SPEC_ONNX_EMBEDDER.md, WIN10_ARCHITECTURE_DESIGN.md, WIN10_11_INSTALL_GUIDE.md, GAPS_AUDIT.md

---

## Что делать — полный список задач

### P0 — Блокирующие (без этого ничего не работает)

---

#### TASK-01: Создать `embed/embed_server.py`

**Спека:** `docs/SPEC_ONNX_EMBEDDER.md`  
**Файл создать:** `C:\context-manager\embed\embed_server.py`

Код полностью описан в спеке. Скопировать блок "Реализация" и убедиться что:
- `GET /health` → `{"status": "ok"}`
- `POST /embed {"inputs": "text"}` → `[[float...]]` (384 значения)
- `POST /embed {"inputs": ["t1", "t2"]}` → `[[...], [...]]`
- Mean pooling с attention_mask
- L2 нормализация вектора

**Создать также:** `embed/requirements.txt` (из спеки) и `embed/watchdog_cm.py` (из WIN10_ARCHITECTURE_DESIGN.md).

**Проверка:**
```powershell
cd C:\context-manager\embed
$env:MODEL_DIR = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
python embed_server.py
# В другом терминале:
curl http://127.0.0.1:8080/health  # → {"status":"ok"}
curl -X POST http://127.0.0.1:8080/embed -H "Content-Type: application/json" -d '{"inputs":"hello"}'
# Ожидается вектор из 384 чисел
```

---

#### TASK-02: Исправить `mcp/server.js` — читать env для API_BASE

**Файл:** `mcp/server.js`, строка 6  
**Проблема:** API_BASE захардкодирован (найдено аудитом, подтверждено контрольной проверкой)

```javascript
// БЫЛО (строка 6):
const API_BASE = 'http://localhost:3847/api/context';

// СТАЛО:
const API_BASE = process.env.CM_API_BASE || 'http://localhost:3847/api/context';
```

**После изменения:** пересобрать если нужно (файл .js, не .ts — правка прямая).

---

#### TASK-03: Создать `.env.windows`

**Файл создать:** `.env.windows` в корне проекта  

```env
# Context Manager — Windows 10/11 Native (без Docker)
# Скопировать: copy .env.windows .env

PORT=3847
HOST=127.0.0.1
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=*

# PostgreSQL — localhost (не Docker DNS!)
DATABASE_URL=postgresql://postgres:YOURPASSWORD@localhost:5432/context_db
DB_POOL_SIZE=20
DB_IDLE_TIMEOUT=30000

# Qdrant — localhost
QDRANT_HOST=localhost
QDRANT_PORT=6333

# ONNX Embedder (заменяет TEI)
EMBEDDING_PROVIDER=huggingface-tei
TEI_HOST=http://127.0.0.1:8080
EMBEDDING_DIMENSIONS=384

# Sync
SYNC_BATCH_SIZE=100
SYNC_INTERVAL_MS=60000
```

**Критично:** `HOST=127.0.0.1` (не `0.0.0.0` как в `.env.example`) и `DATABASE_URL` с `localhost`.

---

#### TASK-04: Скачать ONNX модель

**Путь:** `C:\context-manager\models\multilingual-e5-small_Q8\onnx\`

```powershell
pip install huggingface_hub
python -c "
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='intfloat/multilingual-e5-small',
    local_dir=r'C:\context-manager\models\multilingual-e5-small_Q8\onnx',
    allow_patterns=['*.onnx', 'tokenizer*', 'config.json', 'special_tokens*', 'vocab*', '*.model']
)
"
```

**Проверить наличие:** хотя бы одного из `model.onnx`, `model_optimized.onnx`, `model_quantized.onnx`.

---

### P1 — Высокий приоритет

---

#### TASK-05: Расширить `scripts/install.ps1` → `scripts/install-native.ps1`

**Текущий `install.ps1`** покрывает только: node check → npm install → build → init-mcp-config.  
**Нужно добавить** (или создать `install-native.ps1`):

```
1. Проверка prerequisites: node, python, nssm, psql
2. npm install + npm run build
3. node scripts/init-mcp-config.mjs
4. pip install -r embed/requirements.txt
5. Инструкции по скачиванию модели (или автоскачивание)
6. copy .env.windows .env (с запросом пароля PG)
7. Регистрация всех nssm сервисов (из WIN10_ARCHITECTURE_DESIGN.md)
8. Smoke tests всех портов
```

Полные nssm команды — в `docs/WIN10_ARCHITECTURE_DESIGN.md`.

---

#### TASK-06: Создать `scripts/download-model.ps1`

```powershell
param(
    [string]$ModelDir = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
)

$ErrorActionPreference = "Stop"
Write-Host "Downloading multilingual-e5-small ONNX model..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null

python -c @"
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='intfloat/multilingual-e5-small',
    local_dir=r'$ModelDir',
    allow_patterns=['*.onnx', 'tokenizer*', 'config.json', 'special_tokens*', 'vocab*', '*.model']
)
print('Done.')
"@

$onnxFiles = Get-ChildItem $ModelDir -Filter "*.onnx"
if ($onnxFiles.Count -eq 0) {
    Write-Host "ERROR: No .onnx file found in $ModelDir" -ForegroundColor Red
    exit 1
}
Write-Host "Model ready: $($onnxFiles[0].Name)" -ForegroundColor Green
```

---

### P2 — Средний приоритет

---

#### TASK-07: Добавить `mcp.json.template` фикс в README

`init-mcp-config.mjs` генерирует `mcp.json` с абсолютным путём к `server.js`.  
Текущий `mcp.json` в repo содержит `"./mcp/server.js"` — это работает только при запуске из директории проекта.

**Добавить в README:** "После установки всегда запускать `node scripts/init-mcp-config.mjs`".

---

#### TASK-08: Добавить `engines` в `package.json`

```json
"engines": {
  "node": ">=18.0.0"
}
```

---

#### TASK-09: Batch-оптимизация embeddings (опционально)

**Проблема:** `embedding.service.ts` вызывает `getEmbedding()` в loop для каждого chunk — N HTTP запросов вместо 1.  
**Потенциальный фикс:** Добавить `getEmbeddingBatch(texts: string[])` который отправляет `{inputs: [...]}`.  
**Приоритет:** Низкий — работает корректно, просто медленнее при большом количестве chunks.

---

## Порядок реализации

```
TASK-01 (embed_server.py)     → тест embedder отдельно
TASK-04 (скачать модель)      → нужна для TASK-01
TASK-02 (server.js env)       → простой однострочник
TASK-03 (.env.windows)        → создать файл
TASK-06 (download-model.ps1)  → вспомогательный скрипт
TASK-05 (install-native.ps1)  → финальный инсталлятор, зависит от всего выше
TASK-07 (README)              → документация
TASK-08 (package.json)        → 1 строка
```

---

## Файлы которые создаются/меняются

| Файл | Действие | Задача |
|------|----------|--------|
| `embed/embed_server.py` | СОЗДАТЬ | TASK-01 |
| `embed/requirements.txt` | СОЗДАТЬ | TASK-01 |
| `embed/watchdog_cm.py` | СОЗДАТЬ | TASK-01 |
| `mcp/server.js` | ИЗМЕНИТЬ строку 6 | TASK-02 |
| `.env.windows` | СОЗДАТЬ | TASK-03 |
| `scripts/download-model.ps1` | СОЗДАТЬ | TASK-06 |
| `scripts/install-native.ps1` | СОЗДАТЬ | TASK-05 |
| `package.json` | ИЗМЕНИТЬ (+engines) | TASK-08 |

---

## Что НЕ трогать

| Файл | Причина |
|------|---------|
| `src/**/*.ts` | Весь TypeScript код кроссплатформенный |
| `mcp/cm_http_adapter.mjs` | Уже читает `CM_API_BASE` из env, дефолт корректен |
| `scripts/init-mcp-config.mjs` | Работает правильно, генерирует абсолютный путь |
| `docker-compose.yml` | Оставить для Linux/macOS пользователей |
| `.env.example` | Оставить как есть (для Docker) |
| `src/config/paths.ts` | Уже кроссплатформенный (`os.homedir()`, `APPDATA`) |

---

## Спеки для реализации (в порядке чтения)

1. `docs/GAPS_AUDIT.md` — сначала: что реально сломано vs HVOSTY
2. `docs/SPEC_ONNX_EMBEDDER.md` — техническая спека embedder'а
3. `docs/WIN10_ARCHITECTURE_DESIGN.md` — полная архитектура + nssm конфиги
4. `docs/WIN10_11_INSTALL_GUIDE.md` — пошаговый гайд (для install-native.ps1)
