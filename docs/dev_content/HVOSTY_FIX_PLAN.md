# План устранения хвостов / багов / паразитных связей

Основание: аудит от 2026-06-04 — все найденные проблемы после имплементации блоков 1-8.

---

## Блок 9. Конфигурационный рассинхрон (.env vs .env.example)

| # | Проблема | Файл | Строка | Северити |
|---|----------|------|--------|----------|
| 9.1 | `EMBEDDING_PROVIDER=none` (должно быть `huggingface-tei`) | `.env` | 26 | CRITICAL |
| 9.2 | `EMBEDDING_DIMENSIONS=768` (должно быть `384`) | `.env` | 27 | CRITICAL |
| 9.3 | 4 мёртвых `WEAVIATE_*` vars вместо `QDRANT_HOST/PORT`, `TEI_HOST` | `.env` | 19-23 | HIGH |
| 9.4 | `PG_HOST/PORT/DB/USER/PASS` — используются только для сборки DATABASE_URL в самом .env, код читает только DATABASE_URL | `.env` | 9-13 | MEDIUM |

**Фикс:** Обновить `.env` — убрать Weaviate/легаси, добавить Qdrant/TEI vars, привести EMBEDDING_* в соответствие с .env.example.

**Риск:** После изменения `.env` сервер начнёт использовать TEI (раньше был `none`). Надо убедиться, что TEI контейнер запущен.

---

## Блок 10. resync_qdrant.py — порты не совпадают

| # | Проблема | Файл | Строка | Северити |
|---|----------|------|--------|----------|
| 10.1 | `QDRANT_URL = "http://localhost:6334"` — реальный порт **6333** | `resync_qdrant.py` | 28 | CRITICAL |
| 10.2 | `PG_PORT` default = **5433** — реальный порт **5432** | `resync_qdrant.py` | 21 | CRITICAL |
| 10.3 | `PG_HOST` default = `localhost` — в Docker compose используется `qdrant-new` | `resync_qdrant.py` | 20 | MEDIUM |

**Фикс:** Исправить дефолтные порты на 6333 и 5432 соответственно.

---

## Блок 11. mcp.json — шаблонная переменная не подставлена

| # | Проблема | Файл | Строка | Северити |
|---|----------|------|--------|----------|
| 11.1 | `"args": ["{{MCP_SERVER_PATH}}/server.js"]` — переменная не заменена | `mcp.json` | 6 | HIGH |
| 11.2 | `init-mcp-config.mjs` вызывается, но `mcp.json` не регенерируется при changes | `scripts/init-mcp-config.mjs` | — | MEDIUM |

**Фикс:**
- Заменить `{{MCP_SERVER_PATH}}` в `mcp.json` на реальный путь (дефолт Linux: `~/.config/iflow/mcp`)
- Либо добавить хук postinstall в `package.json`, который запускает `init-mcp-config.mjs`

---

## Блок 12. Type Safety

| # | Проблема | Файл | Строка | Северити |
|---|----------|------|--------|----------|
| 12.1 | `executeRawQuery(params: any[])` — SQL injection vector | `src/services/postgres.service.ts` | 647 | HIGH |
| 12.2 | `(data.metadata as any)?.agent` повторяется 7+ раз | `qdrant.service.ts`, `postgres.service.ts` | — | HIGH |
| 12.3 | `request: any` на 5 route handlers | `src/routes/context.routes.ts` | 478, 506, 517, 538, 597 | MEDIUM |
| 12.4 | `semanticSearch` возвращает `Promise<any[]>` | `src/services/qdrant.service.ts` | 135 | MEDIUM |
| 12.5 | `as any` в search.routes.ts (3 места) | `src/routes/search.routes.ts` | 67, 76, 100 | MEDIUM |

**Фикс:**
- 12.2: Создать типизированный accessor для metadata в `src/types/index.ts`
- 12.1, 12.3-12.5: Заменить `any` на конкретные типы. Использовать `FastifyRequest` generic.
- 12.1: Для executeRawQuery — параметризация уже есть через `$1, $2`, но входящие типы надо застраховать.

---

## Блок 13. Мёртвый код / stale артефакты

| # | Проблема | Файл | Строка | Северити |
|---|----------|------|--------|----------|
| 13.1 | `interface ContextDataWithTypes` — нигде не используется | `src/types/index.ts` | 78-80 | MEDIUM |
| 13.2 | `WEAVIATE_*` env vars — мёртвые, код удалён | `.env` | 19-23 | HIGH |
| 13.3 | `dist/services/weaviate.service.js` — stale build artifact | `dist/` | — | LOW |

**Фикс:**
- 13.1: Удалить `ContextDataWithTypes`
- 13.2: Удалить из `.env` (см. Блок 9)
- 13.3: `rm -rf dist/ && npm run build` (пересобрать)

---

## Блок 14. Secrets / Security

| # | Проблема | Файл | Строка | Северити |
|---|----------|------|--------|----------|
| 14.1 | `PG_PASS=Mart436780` в открытом виде на диске | `.env` | 13 | HIGH |
| 14.2 | `DATABASE_URL` default `postgres:postgres` в docker-compose | `docker-compose.yml` | 9 | MEDIUM |
| 14.3 | `resync_qdrant.py` передаёт пароль через env var (логи) | `resync_qdrant.py` | 91 | MEDIUM |

**Фикс:**
- 14.1: Заменить пароль на переменную `${PG_PASS}` в `.env.example`, в `.env` — оставить как есть (файл не коммитится)
- 14.2: Вынести DATABASE_URL в `.env` полностью, убрать пароль из docker-compose.yml default
- 14.3: resync_qdrant.py — логировать без пароля

---

## Блок 15. Stale git-tracked файлы

| # | Проблема | Файл | Северити |
|---|----------|------|----------|
| 15.1 | `src/services/qdrant.service.ts.1` — tracked in git | корень | LOW |
| 15.2 | `src/routes/context.routes.ts.old` — tracked in git | корень | LOW |

**Фикс:** `git rm` + добавить `*.ts.1` и `*.old` в `.gitignore`

---

## Блок 16. Документация (дополнительно)

| # | Проблема | Файл | Строка | Северити |
|---|----------|------|--------|----------|
| 16.1 | Упоминает `weaviate.service.ts` (удалён) | `Структура проекта.md` | 9 | MEDIUM |
| 16.2 | Отсутствуют `migration.ts`, `paths.ts`, `timeParser.service.ts`, `contentDetector.service.ts` | `Структура проекта.md` | 8-10 | LOW |
| 16.3 | API docs: `/v1/context` вместо `/api/context/save` | `README.md` | 47-48 | LOW |
| 16.4 | `mcp/server.js` хардкодит `http://localhost:3847` | `mcp/server.js` | 6 | LOW |

**Фикс:**
- 16.1-16.2: Обновить `Структура проекта.md`
- 16.3: Обновить `README.md` API endpoints
- 16.4: Сделать `CM_API_BASE` env-configurable в mcp/server.js

---

## Порядок имплементации

| Приоритет | Блок | Зависит от | Оценка |
|-----------|------|-----------|--------|
| P0 | **9** — .env config desync | — | 5 мин |
| P0 | **10** — resync ports | — | 5 мин |
| P0 | **11** — mcp.json template | — | 5 мин |
| P1 | **12** — type safety | — | 1-2 ч |
| P1 | **13** — dead code | 9 | 10 мин |
| P2 | **14** — secrets | 9 | 10 мин |
| P2 | **15** — stale git files | — | 5 мин |
| P3 | **16** — docs | 9 | 15 мин |
