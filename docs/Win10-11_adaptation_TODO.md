# Windows 10/11 Adaptation — TODO

## 🔴 Critical (must fix before launch)

- [ ] **`src/routes/context.routes.ts:507,514`** — replace `process.env.HOME` with `os.homedir()` + `path.join()`
      ```typescript
      // BEFORE:
      `${process.env.HOME}/.iflow/context-manager-config.json`
      // AFTER:
      import path from 'path';
      import os from 'os';
      path.join(os.homedir(), '.iflow', 'context-manager-config.json')
      ```
      After fixing — rebuild: `npm run build`

## 🟡 Minor (nice to have)

- [ ] **`client/scripts/iflow_context.sh`** — create `client/scripts/iflow_context.bat` or PowerShell equivalent
- [ ] **`docker-compose.yml`** — replace hardcoded `/home/gg/...` volume paths with Windows-compatible variables
- [ ] **`resync_qdrant.py`** — document Windows invocation: `python resync_qdrant.py` (shebang ignored on Win)

## 🐳 Docker: полная несовместимость без виртуализации

**Если в BIOS/UEFI выключена поддержка виртуализации (Intel VT-x / AMD-V):**
- WSL2 — не работает (требует виртуализацию)
- Hyper-V — не работает (требует виртуализацию)
- Docker Desktop — **не может запускать Linux-контейнеры**
- Все 3 сервиса в `docker-compose.yml` — Linux-контейнеры → **запустить их невозможно**

### Альтернатива: запуск компонентов нативно (без Docker)

| Компонент | Как запустить на Windows | Статус |
|-----------|--------------------------|--------|
| **Node.js app** | `npm start` | ✅ Нативно |
| **CM MCP adapter** | `node mcp/cm_http_adapter.mjs` | ✅ Нативно |
| **PostgreSQL** | `winget install PostgreSQL` или EDB installer | ✅ Нативный Windows binary |
| **Qdrant** | `pip install qdrant-client` или скачать Windows binary с qdrant.tech | ✅ Есть Windows сборка |
| **TEI (HuggingFace)** | `ghcr.io/huggingface/text-embeddings-inference` — **Linux-only**, без Docker не работает | ❌ Блокер |

### Что делать с TEI

TEI не имеет Windows-сборки. Варианты:
1. **`EMBEDDING_PROVIDER=openai`** — использовать OpenAI API (нужен `OPENAI_API_KEY`)
2. **`EMBEDDING_PROVIDER=none`** — `NoOpEmbeddingService`, возвращает нулевые векторы (semantic search не работает)
3. Запустить TEI на удалённом Linux-сервере и указать `TEI_HOST` в .env

### Нативные настройки .env для Windows (без Docker)

```env
PORT=3847
HOST=127.0.0.1

# PostgreSQL — локальный Windows
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/context_db

# Qdrant — локальный Windows
QDRANT_HOST=127.0.0.1
QDRANT_PORT=6333

# TEI недоступен — используем openai или none
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
EMBEDDING_DIMENSIONS=384
```

## 🏗 Архитектура без Docker: запуск, контроль, сеть

Когда Docker убран, компоненты теряют:
- автоматический запуск при загрузке
- restart on failure
- единую сеть с DNS-резолвингом (`context-manager`, `tei-embeddings`)
- изоляцию логов

Нужна альтернатива для всего этого.

### Схема связей

```
┌─────────────────────────────────────────────┐
│                  localhost                    │
│                                               │
│  [PostgreSQL] ← TCP:5432                      │
│       ↑                                       │
│  [Qdrant]     ← HTTP:6333                     │
│       ↑                                       │
│  [ONNX embed] ← HTTP:8080  (заменяет TEI)    │
│       ↑                                       │
│  [Context Manager] ← HTTP:3847                │
│       ↑                                       │
│  [MCP adapter]  → HTTP:3847 (client)         │
│       ↑                                       │
│  [Watchdog] → health checks всех компонентов  │
└─────────────────────────────────────────────┘
```

Всё через `127.0.0.1:<port>` — Docker DNS не нужен, hosts-файл не нужен.

### Варианты менеджера процессов

| Вариант | Автостарт | Restart | Health check | Порядок запуска |
|---------|-----------|---------|-------------|-----------------|
| **Windows Task Scheduler** | ✅ | ❌ single shot | ❌ | ❌ |
| **nssm** (service wrapper) | ✅ | ✅ per service | ❌ | ✅ depends |
| **winsw** | ✅ | ✅ per service | ❌ | ✅ depends |
| **Самодельный watchdog** (Python/PowerShell) | ✅ через Task Scheduler | ✅ | ✅ HTTP ping | ✅ wait-for |
| **Cервис Mnemostroma watchdog** (если уже стоит) | ✅ | ✅ | ✅ | ✅ |

### Рекомендация: watchdog + nssm

**Базовый слой — nssm** (каждый компонент как Windows Service):

```powershell
# PostgreSQL — ставится как служба инсталлятором, по умолчанию
# Qdrant
nssm install qdrant "C:\qdrant\qdrant.exe"
nssm set qdrant AppParameters "--uri http://127.0.0.1:6333"
nssm start qdrant

# Context Manager
nssm install cm "C:\Program Files\nodejs\node.exe"
nssm set cm AppParameters "C:\context-manager\dist\index.js"
nssm set cm AppDirectory "C:\context-manager"
nssm start cm

# MCP adapter
nssm install cm-mcp "C:\Program Files\nodejs\node.exe"
nssm set cm-mcp AppParameters "C:\context-manager\mcp\cm_http_adapter.mjs"
nssm set cm-mcp AppDirectory "C:\context-manager\mcp"
nssm start cm-mcp
```

**Слой контроля — watchdog** (Python/PowerShell скрипт):

```python
# watchdog_cm.py — health-check цикл
SERVICES = [
    {"name": "postgresql", "port": 5432, "type": "tcp"},
    {"name": "qdrant",     "port": 6333, "type": "http", "path": "/health"},
    {"name": "onnx-embed", "port": 8080, "type": "http", "path": "/health"},
    {"name": "cm",         "port": 3847, "type": "http", "path": "/health"},
    {"name": "cm-mcp",     "port": 8770, "type": "http", "path": "/mcp"},
]

while True:
    for svc in SERVICES:
        if not health_check(svc):
            restart_service_winsw(svc["name"])
    await asyncio.sleep(5)
```

Запуск watchdog — через Task Scheduler (At startup) или как nssm-сервис.

### Порядок запуска

```
1. PostgreSQL  (ждём TCP:5432)
2. Qdrant      (ждём HTTP:6333/health)
3. ONNX embed  (ждём HTTP:8080/health)
4. Context Mgr (ждём HTTP:3847/health)
5. MCP adapter (ждём HTTP:3847/health)
```

Watchdog ждёт каждый компонент перед стартом следующего (poll с таймаутом 30s).

### Бесперебойность

| Что | Как обеспечено |
|-----|---------------|
| Падение PostgreSQL | nssm restart → watchdog проверяет health |
| Падение Qdrant | nssm restart → watchdog проверяет |
| Падение Context Manager | nssm restart → watchdog проверяет |
| Зависание (health не отвечает) | watchdog → force kill через `taskkill /F` → nssm restart |
| Логи | nssm пишет stdout/stderr в файл |
| Мониторинг | Watchdog логирует все рестарты в файл |
| Утечка памяти | Watchdog проверяет RSS, при превышении лимита — restart |

## ✅ Already cross-platform (no action needed)

| Component | Reason |
|-----------|--------|
| All npm dependencies | Pure JS/TS, zero native modules, no `pg-native` |
| Fastify HTTP server | Cross-platform |
| MCP stdio adapter (`server.js`) | stdin/stdout — cross-platform |
| MCP HTTP adapter (`cm_http_adapter.mjs`) | `node:http` — cross-platform |
| PostgreSQL client | TCP connection (no Unix socket) |
| Qdrant client | REST API (no local socket) |
| SIGTERM/SIGINT | Supported on Windows Node.js |
| TypeScript config | `target: ES2022`, `module: CommonJS` — no issues |

## 📋 Verification steps after fixes

```powershell
# On Windows:
npm install
npm run build
npm start
# Test:
curl http://localhost:3847/health
curl http://localhost:3847/api/context/config
```
