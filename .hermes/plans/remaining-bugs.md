# Оставшиеся баги

## Раунд 1 — Критические (оценка 1)
- [ ] #1 — `cm_http_adapter.mjs:79` — `records` → `results`
- [ ] #2 — `cm_http_adapter.mjs:75-78` — развернуть body
- [ ] #3a — `server.js` — те же правки
- [ ] #3b — `mcp_sse_adapter.py:221` — `records` → `results`

## Раунд 2 — Мелочи (оценка 1)
- [ ] #6 — `resync_qdrant.py` — порты в env
- [ ] #7 — `docker rmi` старого имиджа
- [ ] #9 — обновить docs sync
- [ ] #10 — алерт при `sync_status='failed'`

## ОСТАНОВ
- [ ] #5 — Аудит целостности PG↔Qdrant (< 80%, сложный)

## Сделано
- [x] #4 — Periodic batch sync worker
