---
tags: [windows, win10, win11, dockerless, migration, watchdog, nssm, onnx, embedding, tei-replacement, service-wrapper, process-manager, portainer]
---

# Windows 10/11 Adaptation — TODO

> Keywords: win10 win11 windows dockerless migration watchdog nssm winsw process-manager portainer tei-replacement onnx-embedder service-wrapper

## 🔴 Critical (must fix before launch)

### P1. CONFIG PATH: `process.env.HOME` → `os.homedir()` (`src/routes/context.routes.ts:507,514`)

```typescript
// ❌ BREAKS ON WINDOWS — process.env.HOME is undefined
`${process.env.HOME}/.iflow/context-manager-config.json`

// ✅ CROSS-PLATFORM — os.homedir() + path.join()
import path from 'path';
import os from 'os';
path.join(os.homedir(), '.iflow', 'context-manager-config.json')
```

After fixing — rebuild: `npm run build`

### P2. ONNX EMBEDDER: replace TEI Linux-only dependency (`src/services/embedding.service.ts`)

TEI (`ghcr.io/huggingface/text-embeddings-inference`) has **no Windows binary** — requires Docker + Linux. Need an ONNX-based embedder as native Windows replacement.

See `ONNX_EMBEDDER.md` (separate spec doc) for:
- Model: `multilingual-e5-small` INT8 (384d, ~40MB, ~15ms)
- Runtime: `onnxruntime` (PyPI or `onnxruntime-node`)
- API shape: `POST /embed {inputs: [text]} → [[float]]` (compatible with TEI interface)
- Zero Docker, zero Linux

## 🟡 Minor (nice to have)

### M1. SHELL SCRIPT: `client/scripts/iflow_context.sh`

Create `client/scripts/iflow_context.bat` or PowerShell equivalent for Windows.

### M2. DOCKER COMPOSE: hardcoded Linux paths (`docker-compose.yml`)

Replace `/home/gg/...` volume paths with Windows-compatible variables (or remove — Docker won't run on Win without virtualization).

### M3. PYTHON SHEBANG: `resync_qdrant.py`

Document Windows invocation: `python resync_qdrant.py` (shebang `#!/usr/bin/env python3` ignored on Win).

## 🐳 DOCKER: why it won't work on Win10/11 without virtualization

**Hard requirement for Docker Desktop Linux containers:**
- Intel VT-x / AMD-V must be **enabled** in BIOS/UEFI
- WSL2 **requires** hardware virtualization
- Hyper-V **requires** hardware virtualization

**If virtualization is disabled:**
| Feature | Works? | Why |
|---------|--------|-----|
| Docker Desktop | ❌ | Can't run Linux containers |
| WSL2 | ❌ | Needs VT-x/AMD-V |
| Hyper-V | ❌ | Needs SLAT |
| WSL1 | ✅ | No virtualization needed, but **can't run Docker** |

**All 3 services in `docker-compose.yml` are Linux containers:**
- `context-manager` (build from Dockerfile)
- `tei-embeddings` (`ghcr.io/huggingface/text-embeddings-inference`)
- `cm-mcp-adapter` (`node:22-alpine`)

→ **docker-compose.yml will never start on such a system.**

## 🏗 ARCHITECTURE: without Docker

### Network topology (all on localhost)

```
┌─────────────────────────────────────────────┐
│                127.0.0.1                     │
│                                              │
│  [PostgreSQL]     ← TCP:5432                 │
│       ↑                                      │
│  [Qdrant]         ← HTTP:6333                │
│       ↑                                      │
│  [ONNX embedder]  ← HTTP:8080 (replaces TEI) │
│       ↑                                      │
│  [Context Manager] ← HTTP:3847               │
│       ↑                                      │
│  [MCP adapter]    → HTTP:3847 (client)       │
│       ↑                                      │
│  [Watchdog]       → health-checks all        │
└─────────────────────────────────────────────┘
```

No Docker DNS needed — everything resolves via `127.0.0.1:<port>`.

### Components: native Windows availability

| Component | Windows binary | How to install |
|-----------|---------------|----------------|
| **Node.js app** | ✅ Native | `npm start` |
| **CM MCP adapter** | ✅ Native | `node mcp/cm_http_adapter.mjs` |
| **PostgreSQL** | ✅ Native | `winget install PostgreSQL` or EDB installer |
| **Qdrant** | ✅ Native | Download from qdrant.tech or `pip install qdrant-client` |
| **TEI (HuggingFace)** | ❌ BLOCKER | No Windows build. Replace with ONNX embedder (see P2). |

### Process manager: recommended stack

**Base layer — nssm** (wraps any .exe as Windows Service):

```powershell
# Install nssm: winget install nssm

# PostgreSQL — installed as service by default

# Qdrant
nssm install qdrant "C:\qdrant\qdrant.exe"
nssm set qdrant AppParameters "--uri http://127.0.0.1:6333"
nssm start qdrant

# ONNX embedder (Python)
nssm install onnx-embed "C:\Python312\python.exe"
nssm set onnx-embed AppParameters "-m uvicorn embed_server:app --host 127.0.0.1 --port 8080"
nssm set onnx-embed AppDirectory "C:\context-manager\embed"
nssm start onnx-embed

# Context Manager (Node.js)
nssm install cm "C:\Program Files\nodejs\node.exe"
nssm set cm AppParameters "C:\context-manager\dist\index.js"
nssm set cm AppDirectory "C:\context-manager"
nssm start cm

# MCP HTTP adapter (Node.js)
nssm install cm-mcp "C:\Program Files\nodejs\node.exe"
nssm set cm-mcp AppParameters "C:\context-manager\mcp\cm_http_adapter.mjs"
nssm set cm-mcp AppDirectory "C:\context-manager\mcp"
nssm start cm-mcp
```

**Control layer — watchdog** (Python/PowerShell health-check loop):

```python
# watchdog_cm.py — runs as nssm service or Task Scheduler
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
            restart_service_nssm(svc["name"])
    await asyncio.sleep(5)
```

### Startup order

| Step | Component | Wait condition | Timeout |
|------|-----------|---------------|---------|
| 1 | PostgreSQL | TCP:5432 | 30s |
| 2 | Qdrant | HTTP:6333/health | 30s |
| 3 | ONNX embedder | HTTP:8080/health | 30s |
| 4 | Context Manager | HTTP:3847/health | 30s |
| 5 | MCP adapter | HTTP:3847/health | 30s |

### Uptime guarantees

| Scenario | Mechanism |
|----------|-----------|
| Process crash | nssm auto-restart (immediate) |
| Process hang (no health response) | watchdog → `taskkill /F` → nssm restarts |
| Memory leak (RSS > limit) | watchdog detects → restart |
| Boot | nssm services start automatically (Auto start) |
| Logs | nssm writes stdout/stderr to `C:\ProgramData\nssm\logs\` |

### .env for Windows (without Docker)

```env
PORT=3847
HOST=127.0.0.1

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/context_db

QDRANT_HOST=127.0.0.1
QDRANT_PORT=6333

# ONNX embedder (local, replaces TEI)
TEI_HOST=http://127.0.0.1:8080
EMBEDDING_PROVIDER=huggingface-tei
EMBEDDING_DIMENSIONS=384

# Alternative: OpenAI (if ONNX not ready)
# EMBEDDING_PROVIDER=openai
# OPENAI_API_KEY=sk-...
```

## 📦 Memory budget (estimated, without Docker)

| Component | RAM estimate |
|-----------|-------------|
| PostgreSQL | ~7 MB |
| Qdrant | ~20 MB |
| ONNX embedder (Python + e5-small int8) | ~45 MB |
| Context Manager (Node.js) | ~11 MB |
| MCP adapter (Node.js) | ~10 MB |
| Watchdog (Python) | ~5 MB |
| **Total** | **~98 MB** |

Compare with current Docker stack: ~78 MB (Docker) + ~25 MB (duplicates) = ~103 MB.

## ✅ Already cross-platform (no action needed)

| Component | Reason |
|-----------|--------|
| All npm dependencies | Pure JS/TS, zero native modules, no `pg-native` |
| Fastify HTTP server | Cross-platform |
| MCP stdio adapter (`server.js`) | stdin/stdout — cross-platform |
| MCP HTTP adapter (`cm_http_adapter.mjs`) | `node:http` — cross-platform |
| PostgreSQL client | TCP connection (no Unix socket) |
| Qdrant client | REST API (no local socket) |
| SIGTERM/SIGINT | Supported on Windows Node.js, native on macOS |
| TypeScript config | `target: ES2022`, `module: CommonJS` |

---

# macOS Adaptation

> Keywords: macos apple-silicon m1 m2 m3 intel darwin homebrew docker-desktop hyperkit

## 🔴 Critical (must fix before macOS launch)

### M1. MCP CONFIG: `/usr/bin/node` hardcoded (`mcp.json:5`)

```json
{
  "servers": {
    "context-manager": {
      "command": "/usr/bin/node"   // ❌ не существует на macOS
    }
  }
}
```

**macOS reality:**

| CPU | Node.js path |
|-----|-------------|
| Apple Silicon (M1/M2/M3) | `/opt/homebrew/bin/node` |
| Intel | `/usr/local/bin/node` |
| `/usr/bin/node` | ❌ не существует |

**Fix:** заменить на динамическое определение или документацию:

```json
{
  "servers": {
    "context-manager": {
      "command": "/opt/homebrew/bin/node",   // Apple Silicon
      // или /usr/local/bin/node dla Intel
      "args": ["/Users/<username>/.iflow/mcp-servers/context-manager/server.js"]
    }
  }
}
```

**Альтернатива:** использовать `which node` в скрипте-обёртке:

```bash
#!/bin/bash
NODE=$(which node)
exec "$NODE" "/Users/$(whoami)/.iflow/mcp-servers/context-manager/server.js" "$@"
```

### M2. MCP CONFIG: `/home/gg/...` hardcoded path (`mcp.json:6`)

```json
"args": ["/home/gg/.iflow/mcp-servers/context-manager/server.js"]
```

На macOS домашняя директория — `/Users/<username>/`, не `/home/gg/`.

**Fix:** заменить на `/Users/<username>/` или использовать `$HOME`:

```json
"args": ["${HOME}/.iflow/mcp-servers/context-manager/server.js"]
```

### M3. DOCKER VOLUMES: `/home/gg/...` paths (`docker-compose.yml:38,60`)

```yaml
volumes:
  - /home/gg/orchestrator/models/embedding/multilingual-e5-small_Q8/onnx:/data:ro       # :38
  - /home/gg/orchestrator/docker-stacks/context-manager/mcp:/app:ro                       # :60
```

**Fix:** заменить на переменные окружения:

```yaml
volumes:
  - ${MODEL_PATH:-/Users/gg/orchestrator/models/embedding/multilingual-e5-small_Q8/onnx}:/data:ro
  - ${MCP_PATH:-/Users/gg/orchestrator/docker-stacks/context-manager/mcp}:/app:ro
```

## 🟡 Minor

### M4. `process.env.HOME` — работает на macOS, но не best practice

```typescript
// context.routes.ts:507,514
`${process.env.HOME}/.iflow/context-manager-config.json`
```

На macOS `process.env.HOME` определён (`/Users/<username>`), так что работает. Но:
- Уже запланирован как P1 для Windows (см. выше)
- После фикса на `os.homedir()` будет стабильно на всех трёх платформах

### M5. Docker DNS имена vs localhost (`.env`)

`docker-compose.yml` использует Docker DNS: `qdrant-new`, `tei-embeddings`, `context-manager`.
Для native-запуска нужно переопределить в `.env`:

```env
# Docker DNS → localhost для native запуска
QDRANT_HOST=127.0.0.1
QDRANT_PORT=6333
TEI_HOST=http://127.0.0.1:8080
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/context_db
HOST=127.0.0.1
PORT=3847
```

### M6. Docker platform (docker-compose.yml)

Не указан `platform:`, на Apple Silicon Docker Desktop тянет arm64 варианты образов.
Для `node:22-alpine` — arm64 есть. Для `ghcr.io/huggingface/text-embeddings-inference:cpu-1.8.3` — arm64 CPU образ доступен.

Если нужна гарантия — добавить:
```yaml
services:
  tei-embeddings:
    platform: linux/amd64
```

## ✅ macOS: что работает из коробки

| Компонент | Статус |
|-----------|--------|
| Все npm зависимости | Pure JS, 0 native modules ✅ |
| Fastify HTTP сервер | Кроссплатформенный ✅ |
| MCP stdio adapter (server.js) | stdin/stdout ✅ |
| MCP HTTP adapter (cm_http_adapter.mjs) | node:http ✅ |
| PostgreSQL клиент | TCP (не Unix socket) ✅ |
| Qdrant клиент | REST API ✅ |
| SIGTERM/SIGINT | Нативны на macOS ✅ |
| Shell скрипты | POSIX-совместимы ✅ |
| Python resync_qdrant.py | arm64 wheels для psycopg2 ✅ |
| .DS_Store в .dockerignore | Уже есть ✅ |
| Нет child_process | Всё приложение — HTTP сервер ✅ |
| Нет Unix-сокетов | Только TCP ✅ |
| Нет /proc, /sys, /dev | Не используются ✅ |
| Порты > 1024 | Все не-privileged ✅ |
| Docker Desktop | Работает через HyperKit (не требует VT-x) ✅ |
| GPU passthrough | Не нужен (TEI CPU tag) ✅ |

## 📦 Memory budget (macOS, Docker Desktop)

| Компонент | RAM |
|-----------|-----|
| Docker Desktop (VM) | ~2-3 GB (системный overhead) |
| PostgreSQL (контейнер) | ~7 MB |
| Qdrant (контейнер) | ~20 MB |
| TEI (контейнер) | ~45 MB |
| Context Manager (контейнер) | ~11 MB |
| MCP adapter (контейнер) | ~10 MB |
| **Docker Desktop total** | **~2.1-3.1 GB** |
| **Native (без Docker)** | **~98 MB** (см. Windows budget) |

> **Важно:** Docker Desktop на macOS потребляет 2-3 GB RAM под виртуализацию Linux.
> Для продакшна на macOS рекомендуется native запуск (см. архитектуру без Docker выше).

## 🔍 Verification checklist (macOS)

```bash
# Prerequisites
node --version    # >= 18
npm --version

# Build & start (native)
cd /Users/$(whoami)/projects/context-manager
npm install
npm run build
npm start

# Smoke tests
curl http://127.0.0.1:3847/health
curl http://127.0.0.1:3847/api/context/config

# MCP stdio test
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node /Users/$(whoami)/.iflow/mcp-servers/context-manager/server.js
```

## 🔍 Verification checklist

```powershell
# Prerequisites
node --version    # >= 18
npm --version

# Build & start
cd C:\context-manager
npm install
npm run build
npm start

# Smoke tests
curl http://localhost:3847/health
curl http://localhost:3847/api/context/config

# All services healthy
curl http://localhost:3847/health  # should return pg + qdrant = connected
```
