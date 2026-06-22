# Оставшиеся баги

## Раунд 1 — Критические (оценка 1)
- [x] #1 — `cm_http_adapter.mjs:79` — `records` → `results`
- [x] #2 — `cm_http_adapter.mjs:75-78` — развернуть body
- [x] #3a — `server.js` — те же правки
- [x] #3b — `mcp_sse_adapter.py:221` — `records` → `results`

## Раунд 2 — Мелочи (оценка 1)
- [x] #6 — `resync_qdrant.py` — порты в env
- [x] #7 — `docker rmi` старого имиджа (удалён 238MB)
- [x] #9 — обновить docs sync (написана `docs/sync-architecture.md`)
- [x] #10 — алерт при `sync_status='failed'`

## ОСТАНОВ
- [ ] #5 — Аудит целостности PG↔Qdrant (< 80%, сложный)

## Тесты (добавлены)
- [x] timeParser.service — 9 тестов
- [x] sync.service — 4 теста
- [x] sync.worker — 4 теста
- [x] embedding.service (NoOp) — 4 теста
- [x] config/index.ts — 9 тестов
- [x] contentDetector.service — 12 тестов
- [x] postgres.service (generateSyncId) — 3 теста
- [x] Python MCP (pytest) — 13 тестов: normalize_host, 3 адаптера cm_query формат

## Сделано
- [x] #4 — Periodic batch sync worker
- [x] #1, #2, #3 — cm_query фикс в 3 адаптерах
- [x] #6 — resync_qdrant порты в env
- [x] #7 — docker rmi
- [x] #9 — docs sync-architecture.md
- [x] #10 — алерт при sync_status='failed'
