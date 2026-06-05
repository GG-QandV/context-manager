# Roadmap: Context Manager MCP Integration — оставшиеся шаги (SESSION CONTINUATION)

Дата начала: 2026-01-27  
Дата этой инструкции: 2026-01-28 01:11 CET

## Контекст проекта

**Проект:** PetSafe Validator (backend Node.js/Fastify + PostgreSQL + Qdrant, frontend React/Vite)  
**Текущая задача:** довести MCP Context Manager до production-ready состояния по roadmap из файла истины.

**Окружение:**
- Docker Compose stack: `context-manager` (Fastify API :3847), `postgresql-postgres-main-1` (:5433), `tei-service` (:8080→80)
- MCP server: `/home/gg/.iflow/mcp-servers/context-manager/server.js` (stdio, Node.js)
- Конфиги клиентов:
  - Antigravity: `/home/gg/.gemini/antigravity/mcp_config.json`
  - Docker stack: `/home/gg/orchestrator/docker-stacks/context-manager/mcp.json`
- База данных: `contextdb`, таблица `development_context` (24 колонки, constraints на module/logicalSection)

**Файлы истины (Space files для контекста):**
- `Context_session_26-01-26.md` (file:36) — основной roadmap, DECISIONS, NEXT STEPS 1-6, schema DB
- `Что уже можно зафиксировать фактами.md` (file:1) — дублирует часть roadmap
- `MCP_Context_Manager_Setup_2026-01-27.md` (code_file:212) — рабочие конфиги клиентов (Antigravity/VS Code/Docker stack)

---

## Что уже сделано (фактом 2026-01-27/28)

### ✅ 1. MCP stdio сервер подключён и работает
- **server.js** обновлён до v2.0.1:
  - Убран hardcode `vscode`, добавлен `detectedAgent = process.env.MCP_CLIENT_NAME || args.agent || 'antigravity'`
  - Поддержка `results || items` в ответе API
  - Передача `mode` в `semantic-search`
  - Backup: `/home/gg/.iflow/mcp-servers/context-manager/server.v2.0.0.backup`
- **Проверка валидности:**
  ```bash
  node --check /home/gg/.iflow/mcp-servers/context-manager/server.js && echo "OK"
  ```
- **Smoke-тест initialize + tools/list:**
  ```bash
  printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","method":"initialized","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node /home/gg/.iflow/mcp-servers/context-manager/server.js | jq -r '.result.serverInfo.version'
  ```
  Ожидается: `2.0.1`

### ✅ 2. Конфиги клиентов приведены к stdio
- Antigravity: `/home/gg/.gemini/antigravity/mcp_config.json` → `mcpServers.context-manager` с `command=/usr/bin/node`, `args=[...server.js]`
- Docker stack: `/home/gg/orchestrator/docker-stacks/context-manager/mcp.json` → `servers.context-manager.type=stdio`
- **Проверка из Antigravity (UI):**
  - `Refresh` в MCP Servers
  - `context-manager_cm_search q="mcp integration", n=1` → должен вернуть результат с score

### ✅ 3. HTTP API контейнера работает
- `GET http://localhost:3847/health` → 200
- `POST http://localhost:3847/api/context/semantic-search` с `{"query":"mcp integration","n":1}` → 200 + результаты

---

## Оставшиеся шаги (roadmap по приоритету)

### ШАГ 2: postgres.service.ts — генерация brief/important + metadata.agent

**Файл:** `/home/gg/orchestrator/docker-stacks/context-manager/src/services/postgres.service.ts` (или аналогичный путь в репо)

**Цель:**
1. Добавить/проверить методы `generateBrief(content)` и `generateImportant(content, topics)`:
   - `generateBrief`: усечение до 200-300 символов (или LLM-summary, если есть API ключ)
   - `generateImportant`: извлечение по topics, до 3K символов
2. В методе `createContext` (или аналогичном) записывать в колонки:
   - `content_brief` ← `generateBrief(content)`
   - `content_important` ← `generateImportant(content, metadata.topics)` если `metadata.mode === 'important'`
   - `content_full` ← `content`
3. Убедиться, что `metadata.agent` пишется в `metadata` JSONB-колонку (для фильтрации и GIN-индекса).

**Как получить файл:**
```bash
find /home/gg/orchestrator/docker-stacks/context-manager -name "postgres.service.ts" -type f
cat /path/to/postgres.service.ts | head -n 250
```

**Что нужно проверить в коде:**
- Функция `createContext(data)` принимает `data.content`, `data.metadata`, `data.agent`
- В INSERT-запросе заполняются колонки: `content_brief`, `content_important`, `content_full`, `metadata`
- `metadata` JSONB содержит `{ agent: "antigravity", mode: "brief/important/full", topics?: "..." }`

**Проверка после правок:**
```bash
cd /home/gg/orchestrator/docker-stacks/context-manager && \
npm run build && \
docker-compose restart context-manager
```

**Smoke-тест (из MCP или curl):**
```bash
curl -X POST http://localhost:3847/api/context/save \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session","contextType":"note","content":"Test brief generation with long content...","logicalSection":"shared","agent":"antigravity","metadata":{"agent":"antigravity","mode":"brief"}}'
```
Ожидается: 200, в БД запись с `content_brief` ~200 символов.

---

### ШАГ 3: qdrant.service.ts — прокидка metadata.agent в payload

**Файл:** `/home/gg/orchestrator/docker-stacks/context-manager/src/services/qdrant.service.ts`

**Цель:**
- В методе `createContext` (или `upsert`) добавить в `payload` поле `agent` из `metadata.agent`.
- Это позволит фильтровать векторный поиск по агенту.

**Что нужно проверить:**
```typescript
await this.client.upsert(collectionName, {
  points: [{
    id: syncId,
    vector: embedding,
    payload: {
      content: data.content,
      summary: data.summary,
      agent: data.metadata?.agent || 'unknown',  // <-- добавить
      sessionId: data.sessionId,
      // ...
    }
  }]
});
```

**Проверка:**
```bash
cd /home/gg/orchestrator/docker-stacks/context-manager && \
npm run build && \
docker-compose restart context-manager
```

**Smoke-тест (поиск с фильтром по agent):**
```bash
curl -X POST http://localhost:3847/api/context/semantic-search \
  -H "Content-Type: application/json" \
  -d '{"query":"mcp integration","limit":3,"filters":{"agent":"antigravity"}}'
```
Ожидается: 200, результаты только от `agent=antigravity`.

---

### ШАГ 4: context.schema.ts — добавить фильтры по agent

**Файл:** `/home/gg/orchestrator/docker-stacks/context-manager/src/schemas/context.schema.ts` (или `types/index.ts`)

**Цель:**
- В schema для `semantic-search` и `query` endpoints добавить optional поле `filters.agent`.

**Пример (Zod или Joi):**
```typescript
const SemanticSearchSchema = z.object({
  query: z.string(),
  limit: z.number().default(5),
  filters: z.object({
    agent: z.string().optional(),
    sessionId: z.string().optional(),
  }).optional()
});
```

**Проверка:**
```bash
npm run build
```

---

### ШАГ 5: SQL — добавить GIN индекс по metadata

**Окружение:** PostgreSQL container `postgresql-postgres-main-1`, порт 5433, база `contextdb`

**Команда:**
```bash
docker exec -i postgresql-postgres-main-1 psql -U postgres -d contextdb <<SQL
CREATE INDEX IF NOT EXISTS idx_metadata_agent ON development_context USING gin(metadata jsonb_path_ops);
\di idx_metadata_agent
SQL
```

**Ожидаемый результат:**
```
                                     List of relations
 Schema |        Name         | Type  |  Owner   |       Table        
--------+---------------------+-------+----------+--------------------
 public | idx_metadata_agent  | index | postgres | development_context
```

**Зачем:** ускоряет фильтрацию по `metadata->>'agent'` и другие JSONB-запросы (при росте до 70K+ записей экономия ~200-300мс).

---

### ШАГ 6: README/docs — описать команды MCP

**Создать файл:** `/home/gg/orchestrator/docker-stacks/context-manager/docs/MCP_COMMANDS.md`

**Содержание:**
```markdown
# MCP Context Manager — команды

## Команды сохранения
- `cm_save_br`: brief auto-summary (200-300 символов)
- `cm_save_im`: important by topics (до 3K символов)
- `cm_save_fl`: full log (весь контент)

Параметры: `content`, `session_id` (optional), `agent` (optional), `topics` (для `cm_save_im`)

## Команды поиска
- `cm_search`: семантический поиск в своём контексте
  - `q` (required): запрос
  - `mode`: `br`/`im`/`fl` (default: `im`)
  - `n`: количество результатов (default: 5)
  - `agent`: фильтр по агенту (optional)

- `cm_query`: SQL-фильтры
  - `date`: ISO-дата (optional)
  - `agent`: имя агента (optional)
  - `session`: ID сессии (optional)
  - `mode`: `br`/`im`/`fl` (default: `im`)

- `cm_cross`: поиск в контексте другого агента
  - `q` (required): запрос
  - `from` (required): имя агента
  - `mode`: `br`/`im`/`fl` (default: `im`)
  - `n`: количество результатов (default: 5)

## Команды аналитики
- `cm_agents`: список агентов с количеством записей
- `cm_stats`: статистика (total/sessions/last_updated), параметры: `agent`, `session`
- `cm_export`: экспорт сессии в JSON, параметр: `session` (required), `agent` (optional)
- `cm_help`: справка по командам

## Настройка клиентов

См. `MCP_Context_Manager_Setup_2026-01-27.md` в репозитории.
```

**Команда создания:**
```bash
mkdir -p /home/gg/orchestrator/docker-stacks/context-manager/docs && \
cat > /home/gg/orchestrator/docker-stacks/context-manager/docs/MCP_COMMANDS.md <<'EOF'
[вставить содержимое выше]
EOF
```

---

## Финальная проверка (чек-лист)

После выполнения шагов 2-6:

### 1. Проверка MCP tools из Antigravity
```
context-manager_cm_save_br content="Test brief mode from Antigravity"
context-manager_cm_search q="brief mode", mode="br", n=2
```
Ожидается: сохранение + поиск работают, agent=antigravity в metadata.

### 2. Проверка БД
```bash
docker exec -i postgresql-postgres-main-1 psql -U postgres -d contextdb <<SQL
SELECT 
  id, 
  agent, 
  metadata->>'agent' as meta_agent, 
  metadata->>'mode' as mode,
  length(content_brief) as brief_len,
  length(content_important) as important_len,
  length(content_full) as full_len
FROM development_context
WHERE session_id = 'test-session'
LIMIT 5;
SQL
```
Ожидается: `content_brief` ~200 символов, `metadata->>'agent'` = 'antigravity'.

### 3. Проверка индекса
```bash
docker exec -i postgresql-postgres-main-1 psql -U postgres -d contextdb -c "\d development_context" | grep idx_metadata
```
Ожидается: `idx_metadata_agent` присутствует.

### 4. Проверка Qdrant payload
```bash
curl -X POST http://localhost:9333/collections/context_embeddings/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit":1,"with_payload":true,"filter":{"must":[{"key":"agent","match":{"value":"antigravity"}}]}}'
```
Ожидается: payload содержит `"agent": "antigravity"`.

---

## Rollback (если что-то сломалось)

### server.js
```bash
cp /home/gg/.iflow/mcp-servers/context-manager/server.v2.0.0.backup \
   /home/gg/.iflow/mcp-servers/context-manager/server.js
```

### Backend services
```bash
cd /home/gg/orchestrator/docker-stacks/context-manager && \
git diff src/services/postgres.service.ts src/services/qdrant.service.ts
# если нужно откатить
git checkout src/services/postgres.service.ts src/services/qdrant.service.ts
npm run build && docker-compose restart context-manager
```

### SQL индекс
```bash
docker exec -i postgresql-postgres-main-1 psql -U postgres -d contextdb -c \
  "DROP INDEX IF EXISTS idx_metadata_agent;"
```

---

## Ссылки на файлы истины (Space)

- **Context_session_26-01-26.md** (file:36): roadmap, NEXT STEPS 1-6, DB schema, constraints
- **Что уже можно зафиксировать фактами.md** (file:1): дубль roadmap, MCP tools описание
- **MCP_Context_Manager_Setup_2026-01-27.md** (code_file:212): конфиги клиентов (Antigravity/VS Code/Docker stack)

---

## Контакты и окружение (reminder)

- **User:** gg
- **Location:** `/home/gg/orchestrator/docker-stacks/context-manager`
- **Docker services:** `docker-compose ps` в `/home/gg/orchestrator/docker-stacks/context-manager`
- **Logs:** `docker-compose logs -f context-manager`
- **DB access:** `docker exec -it postgresql-postgres-main-1 psql -U postgres -d contextdb`

---

## Следующая сессия: начать с

1. Прочитать файлы истины (file:36, file:1, code_file:212).
2. Запросить у пользователя:
   ```
   Продолжаем roadmap Context Manager. Нужен файл postgres.service.ts:
   find /home/gg/orchestrator/docker-stacks/context-manager -name "postgres.service.ts" -type f
   ```
3. Дать патч для `postgres.service.ts` (шаг 2).
4. После проверки шага 2 → шаг 3 (qdrant.service.ts).
5. Финальная проверка через чек-лист.

---

**END OF INSTRUCTION**
