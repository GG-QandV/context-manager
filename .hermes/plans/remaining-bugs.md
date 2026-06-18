# Оставшиеся баги

## Раунд 1 — Критические (оценка 1)
- [x] #1 — `cm_http_adapter.mjs:79` — `records` → `results`
- [x] #2 — `cm_http_adapter.mjs:75-78` — развернуть body
- [x] #3a — `server.js` — те же правки
- [x] #3b — `mcp_sse_adapter.py:221` — `records` → `results`

## Раунд 2 — Мелочи (оценка 1)
- [x] #6 — `resync_qdrant.py` — порты в env
- [x] #7 — `docker rmi` старого имиджа (удалён 238MB)
- [ ] #9 — обновить docs sync
- [x] #10 — алерт при `sync_status='failed'`

## ОСТАНОВ
- [ ] #5 — Аудит целостности PG↔Qdrant (< 80%, сложный)

## Сделано
- [x] #4 — Periodic batch sync worker
- [x] #1, #2, #3 — cm_query фикс в 3 адаптерах
