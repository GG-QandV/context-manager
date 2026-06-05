В новой сессии цель: закрепить обязательный RAG-цикл (извлечение перед работой + сохранение после) и довести интеграцию MCP так, чтобы Antigravity/оркестратор и фронтенд‑субагенты **не могли** работать “в пустоту” между сессиями.[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/190eabb7-334a-4b90-a8fc-9eca8767a335/FRONTEND_AGENT_PROTOCOL_ROADMAP_CHECKLIST.md)

## Что уже есть (и работает)

Есть сервис долговременной памяти: Fastify API (порт 3847) + PostgreSQL (development_context) + Qdrant + TEI для эмбеддингов.​  
MCP-обёртка — `~/.iflow/mcp-servers/context-manager/server.js` (stdio) — уже даёт два инструмента: `save` и `search`, которые ходят в API `POST /api/context/save` и `POST /api/context/semantic-search`.[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/a35a9d96-5958-484a-8edd-bdf6d55ac5db/server.js)  
API `/api/context/save` при сохранении добавляет `content_types` (через contentDetector), пишет запись в Postgres и пытается синхронизировать в Qdrant (и ставит sync status).​

## Новый обязательный протокол RAG (для оркестратора/Antigravity)

1. **В начале каждой сессии** оркестратор обязан сделать `search` и загрузить рабочий контекст (последние решения/блокеры/статус интеграции MCP, статус фронтенд-роадмапа), иначе нельзя начинать планирование.[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/190eabb7-334a-4b90-a8fc-9eca8767a335/FRONTEND_AGENT_PROTOCOL_ROADMAP_CHECKLIST.md)

2. **Перед каждой подзадачей** (assign subagent) оркестратор делает `search` по ключам задачи (TaskID/модуль/эндпоинт/ошибка) и прикладывает 3–7 строк найденного контекста в постановку задачи.[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/a35a9d96-5958-484a-8edd-bdf6d55ac5db/server.js)

3. **После каждого завершённого шага** (Part/Final/фикс) оркестратор делает `save` короткой записью: что сделано, какие файлы/пути затронуты, ключевые решения, открытые вопросы/следующий шаг.[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/190eabb7-334a-4b90-a8fc-9eca8767a335/FRONTEND_AGENT_PROTOCOL_ROADMAP_CHECKLIST.md)

Мини-шаблон текста для `save` (контент одной записью):

- `SESSION: <id>`

- `TASK: FRONT-… / MCP-…`

- `SCOPE: allowed paths …`

- `CHANGES: file1, file2`

- `DECISIONS: …`

- `BLOCKERS/NEXT: …`[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/a35a9d96-5958-484a-8edd-bdf6d55ac5db/server.js)

## Обязательное сохранение фронтенд‑существенного (субагенты)

Твой фронтенд‑протокол уже требует после каждого Part “короткую Context note (5–10 строк)” и обновление чеклиста.​  
Меняем правило: эта Context note считается выполненной только если она **сохранена в RAG** через MCP `save` (не просто написана в чате).[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/a35a9d96-5958-484a-8edd-bdf6d55ac5db/server.js)  
Субагент после выдачи кода обязан в конце ответа отдать “Context note” в формате, готовом для прямого `save`, а оркестратор обязан сразу это сохранить.[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/190eabb7-334a-4b90-a8fc-9eca8767a335/FRONTEND_AGENT_PROTOCOL_ROADMAP_CHECKLIST.md)

## Конкретно про MCP-интеграцию (чтобы продолжить завтра без потерь)

Сейчас MCP tool `save` отправляет `sessionId`, `content`, `logicalSection` (через маппинг `level -> logicalSection`) и `summary`, а `search` делает семантический поиск с `limit`.​  
В API уже есть фильтрация/ручки для получения контекста по `sessionId`, по `logicalSection`, по `module` и комбинированно `section + module`, так что разделять “межсессионный контекст интеграции” и “контекст фронтенда” можно логически (без новых таблиц).​  
Завтра в новой сессии минимальный план: проверить `/health`, сделать тестовый `save`, затем `search` по этому тексту, после чего зафиксировать протокол “RAG обязателен” в системном промпте оркестратора и в шаблоне задач для субагентов.[](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/25482385/c06623fd-2464-462f-8d49-103a8ac1197b/context-16-01-26.txt)

Хочешь, я сформулирую готовые 2 блока system prompt: (1) для оркестратора Antigravity, (2) для фронтенд‑субагента — так, чтобы они принудительно делали `search`/`save` по шагам?
