# Context Manager — Windows 10/11 Architecture Design

> Версия: 1.0 | Основание: аудит кода 2026-06-05

---

## Принципы

- Zero Docker, zero WSL, zero Linux
- Все компоненты — нативные Windows бинарники или Python/Node.js
- Все соединения через `127.0.0.1:<port>` (без Docker DNS)
- Автоматический рестарт через nssm (Windows Service wrapper)
- Watchdog поверх nssm для health-check и принудительных рестартов

---

## Компоненты и порты

| Компонент | Порт | Тип | Процесс-менеджер |
|-----------|------|-----|-----------------|
| PostgreSQL | 5432 | TCP | Windows Service (встроен) |
| Qdrant | 6333 | HTTP | nssm → qdrant.exe |
| ONNX Embedder | 8080 | HTTP | nssm → python embed_server.py |
| Context Manager | 3847 | HTTP | nssm → node dist/index.js |
| MCP HTTP Adapter | 8770 | HTTP | nssm → node cm_http_adapter.mjs |
| Watchdog | — | cron | nssm → python watchdog_cm.py |

---

## Сетевая топология

```
┌──────────────────────────────────────────────────────┐
│                    127.0.0.1                          │
│                                                       │
│  [PostgreSQL :5432]  ←── Context Manager             │
│  [Qdrant :6333]      ←── Context Manager             │
│  [ONNX Embed :8080]  ←── Context Manager             │
│                                                       │
│  [Context Manager :3847]                              │
│       ↑                                               │
│  [MCP HTTP Adapter :8770]  ←── AI клиенты (remote)  │
│  [MCP stdio server.js]     ←── IDE (local, stdio)    │
│                                                       │
│  [Watchdog] → health-check всех → nssm restart       │
└──────────────────────────────────────────────────────┘
```

---

## Изменения от Docker-конфигурации

| Параметр | Docker | Windows Native |
|----------|--------|----------------|
| `QDRANT_HOST` | `qdrant-new` (DNS) | `localhost` |
| `TEI_HOST` | `http://tei-embeddings:80` | `http://127.0.0.1:8080` |
| `DATABASE_URL` | `@postgresql-postgres-main-1:5432` | `@localhost:5432` |
| `CM_API_BASE` | `http://context-manager:3847` | `http://127.0.0.1:3847` |
| TEI контейнер | `ghcr.io/huggingface/tei:cpu-1.8.3` | ONNX Embedder (Python) |
| Сеть | `orchestrator-network` | localhost |

---

## .env для Windows (`.env.windows`)

> **Важно:** В `.env.example` `HOST=0.0.0.0` (Docker-режим, все интерфейсы).
> Для Windows native меняем на `127.0.0.1` — только локальный доступ.

```env
# Server
PORT=3847
HOST=127.0.0.1
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=*

# PostgreSQL — NATIVE (не Docker DNS)
DATABASE_URL=postgresql://postgres:YOURPASSWORD@localhost:5432/context_db
DB_POOL_SIZE=20
DB_IDLE_TIMEOUT=30000

# Qdrant — NATIVE
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

---

## Пути на Windows

| Ресурс | Путь |
|--------|------|
| Проект | `C:\context-manager\` |
| ONNX модель | `C:\context-manager\models\multilingual-e5-small_Q8\onnx\` |
| Embedder код | `C:\context-manager\embed\embed_server.py` |
| Конфиг MCP | `%APPDATA%\iflow\context-manager-config.json` |
| MCP server.js | `%APPDATA%\iflow\mcp\server.js` |
| nssm логи | `C:\ProgramData\nssm\logs\` |
| Qdrant binary | `C:\qdrant\qdrant.exe` |
| Qdrant data | `C:\qdrant\storage\` |
| PostgreSQL data | Стандартный инсталлятор EDB |

---

## Порядок запуска (зависимости)

```
Step 1: PostgreSQL  → TCP:5432 ready
Step 2: Qdrant      → HTTP:6333/health ready      (не зависит от PG)
Step 3: ONNX Embed  → HTTP:8080/health ready      (не зависит от PG/Qdrant)
Step 4: Context Mgr → HTTP:3847/health ready      (зависит от 1+2+3)
Step 5: MCP Adapter → проверить HTTP:3847/health  (зависит от 4)
Step 6: Watchdog    → старт после всех            (мониторит всё)
```

nssm запускает каждый сервис независимо, поэтому порядок обеспечивается через watchdog или таймауты в коде Context Manager (Fastify стартует, даже если PG/Qdrant ещё не готовы — они проверяются при первом запросе).

---

## Memory budget

| Компонент | RAM estimate |
|-----------|-------------|
| PostgreSQL | ~7 MB |
| Qdrant | ~20 MB |
| ONNX Embedder (Python + e5-small INT8) | ~83 MB |
| Context Manager (Node.js) | ~11 MB |
| MCP HTTP Adapter (Node.js) | ~10 MB |
| Watchdog (Python) | ~5 MB |
| **Итого** | **~136 MB** |

> Docker stack: ~103 MB в контейнерах + ~2-3 GB Docker Desktop VM.  
> Нативный Windows: ~136 MB суммарно, без виртуализации.

---

## nssm конфигурации всех сервисов

### Qdrant
```powershell
nssm install cm-qdrant "C:\qdrant\qdrant.exe"
nssm set cm-qdrant AppDirectory "C:\qdrant"
nssm set cm-qdrant AppParameters "--uri http://127.0.0.1:6333"
nssm set cm-qdrant AppStdout "C:\ProgramData\nssm\logs\cm-qdrant.log"
nssm set cm-qdrant AppStderr "C:\ProgramData\nssm\logs\cm-qdrant-err.log"
nssm set cm-qdrant Start SERVICE_AUTO_START
```

### ONNX Embedder
```powershell
nssm install cm-embed "C:\Python312\python.exe"
nssm set cm-embed AppParameters "-m uvicorn embed_server:app --host 127.0.0.1 --port 8080"
nssm set cm-embed AppDirectory "C:\context-manager\embed"
nssm set cm-embed AppEnvironmentExtra MODEL_DIR=C:\context-manager\models\multilingual-e5-small_Q8\onnx
nssm set cm-embed AppStdout "C:\ProgramData\nssm\logs\cm-embed.log"
nssm set cm-embed AppStderr "C:\ProgramData\nssm\logs\cm-embed-err.log"
nssm set cm-embed Start SERVICE_AUTO_START
```

### Context Manager
```powershell
nssm install cm-api "C:\Program Files\nodejs\node.exe"
nssm set cm-api AppParameters "dist\index.js"
nssm set cm-api AppDirectory "C:\context-manager"
nssm set cm-api AppEnvironmentExtra DATABASE_URL=postgresql://postgres:YOURPASSWORD@localhost:5432/context_db
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
```

### MCP HTTP Adapter
```powershell
nssm install cm-mcp "C:\Program Files\nodejs\node.exe"
nssm set cm-mcp AppParameters "cm_http_adapter.mjs"
nssm set cm-mcp AppDirectory "C:\context-manager\mcp"
nssm set cm-mcp AppEnvironmentExtra CM_API_BASE=http://127.0.0.1:3847/api/context
nssm set cm-mcp AppEnvironmentExtra CM_MCP_PORT=8770
nssm set cm-mcp AppStdout "C:\ProgramData\nssm\logs\cm-mcp.log"
nssm set cm-mcp AppStderr "C:\ProgramData\nssm\logs\cm-mcp-err.log"
nssm set cm-mcp Start SERVICE_AUTO_START
```

---

## Watchdog (`embed/watchdog_cm.py`)

```python
"""Context Manager Windows Watchdog — health-check + nssm restart."""
import asyncio
import subprocess
import socket
import urllib.request
import logging
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("watchdog")

SERVICES = [
    {"name": "PostgreSQL",  "nssm": None,       "port": 5432, "type": "tcp"},
    {"name": "cm-qdrant",   "nssm": "cm-qdrant","port": 6333, "type": "http", "path": "/health"},
    {"name": "cm-embed",    "nssm": "cm-embed", "port": 8080, "type": "http", "path": "/health"},
    {"name": "cm-api",      "nssm": "cm-api",   "port": 3847, "type": "http", "path": "/health"},
    {"name": "cm-mcp",      "nssm": "cm-mcp",   "port": 8770, "type": "http", "path": "/mcp"},
]

INTERVAL_SEC = int(os.getenv("WD_INTERVAL", "10"))


def tcp_ok(port: int, timeout: float = 3.0) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def http_ok(port: int, path: str, timeout: float = 3.0) -> bool:
    try:
        url = f"http://127.0.0.1:{port}{path}"
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status < 500
    except Exception:
        return False


def nssm_restart(svc: str) -> None:
    logger.warning(f"Restarting service: {svc}")
    subprocess.run(["nssm", "restart", svc], capture_output=True)


async def watch_loop() -> None:
    logger.info(f"Watchdog started, interval={INTERVAL_SEC}s")
    while True:
        for svc in SERVICES:
            if svc["type"] == "tcp":
                ok = tcp_ok(svc["port"])
            else:
                ok = http_ok(svc["port"], svc.get("path", "/health"))

            if not ok:
                logger.error(f"{svc['name']} DOWN (port {svc['port']})")
                if svc["nssm"]:
                    nssm_restart(svc["nssm"])
            else:
                logger.debug(f"{svc['name']} OK")

        await asyncio.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    asyncio.run(watch_loop())
```

nssm для watchdog:
```powershell
nssm install cm-watchdog "C:\Python312\python.exe"
nssm set cm-watchdog AppParameters "watchdog_cm.py"
nssm set cm-watchdog AppDirectory "C:\context-manager\embed"
nssm set cm-watchdog AppStdout "C:\ProgramData\nssm\logs\cm-watchdog.log"
nssm set cm-watchdog Start SERVICE_AUTO_START
```

---

## Что не менялось — полностью кроссплатформенно

| Компонент | Причина |
|-----------|---------|
| Все npm зависимости | Чистый JS/TS, нет native modules |
| Fastify HTTP сервер | Кроссплатформенный |
| PostgreSQL клиент (`pg`) | TCP соединение, не Unix socket |
| Qdrant клиент | REST API |
| MCP stdio (`server.js`) | stdin/stdout |
| MCP HTTP (`cm_http_adapter.mjs`) | `node:http` |
| `src/config/paths.ts` | Использует `os.homedir()` + `process.env.APPDATA` |
| SIGTERM/SIGINT | Node.js поддерживает на Windows |
