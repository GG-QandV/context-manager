# TASK-03 — Создать `.env.windows`

> Уровень: 🟢 Юниор  
> Приоритет: P0 (блокирующий)  
> Спеки: [WIN10_ARCHITECTURE_DESIGN.md](./WIN10_ARCHITECTURE_DESIGN.md) → секция ".env для Windows"

---

## Проблема

Текущий `.env` содержит Docker DNS имена (`PG_HOST=postgresql-postgres-main-1`).  
На нативном Windows эти имена не резолвятся → Context Manager падает при старте.  
Подробности: [GAPS_AUDIT.md](./GAPS_AUDIT.md) → GAP-1.

## Что сделать

Создать файл `.env.windows` в корне проекта (`C:\context-manager\.env.windows`) со следующим содержимым:

```env
# Context Manager — Windows 10/11 Native (без Docker)
# Использование: copy .env.windows .env

PORT=3847
HOST=127.0.0.1
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=*

# PostgreSQL — localhost (НЕ Docker DNS!)
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

**Критично:**
- `HOST=127.0.0.1` — не `0.0.0.0` (в `.env.example` стоит `0.0.0.0` для Docker — это неверно для Windows)
- `DATABASE_URL` — `localhost`, не имя Docker-контейнера
- `YOURPASSWORD` — пользователь заменяет на реальный пароль при установке

## Что НЕ трогать

- `.env.example` — оставить как есть (для Docker-пользователей)
- `.env` — не изменять напрямую

## Проверка

```powershell
# Файл создан
Test-Path "C:\context-manager\.env.windows"
# → True

# Не содержит Docker DNS
(Get-Content ".env.windows") -match "postgresql-postgres-main-1"
# → False (пустой результат)

# Содержит localhost
(Get-Content ".env.windows") -match "HOST=127\.0\.0\.1"
# → True
```

## Регрессионный тест (из WIN10_TEST_SPEC.md)

T6-01, T6-06
