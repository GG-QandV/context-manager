# БАТЧ 1: MCP stdio + agent metadata - ЗАВЕРШЁН ✅

## Что сделано

1. **MCP stdio transport** - Antigravity UI подключён через server.js v2.0.1
2. **Postgres**: поле `metadata.agent` + GIN индекс `idx_metadata_agent`
3. **Qdrant**: поле `agent` в payload + keyword индекс
4. **Semantic search**: фильтр `filters.agent` работает
5. **API**: поле `agent` в JSON результатах
6. **Документация**: `MCP_COMMANDS.md`

## Затык и решение

**Проблема**: Qdrant не сохранял `agent` в payload  
**Причина**: Старый Docker контейнер с устаревшим кодом  
**Решение**: `docker build` + новый контейнер

## Тестирование

### Сохранение контекста с agent
\`\`\`bash
curl -X POST http://localhost:3847/api/context/save \\
  -H 'Content-Type: application/json' \\
  -d '{
    "sessionId": "test-123",
    "agent": "antigravity",
    "contextType": "code",
    "content": "test content"
  }'
\`\`\`

### Поиск с фильтром по agent
\`\`\`bash
curl -X POST http://localhost:3847/api/context/semantic-search \\
  -H 'Content-Type: application/json' \\
  -d '{
    "query": "test",
    "filters": {"agent": "antigravity"},
    "limit": 5
  }'
\`\`\`

### Результат
\`\`\`json
{
  "success": true,
  "results": [{
    "agent": "antigravity",
    "sessionId": "test-123",
    "content": "test content",
    "certainty": 0.95
  }]
}
\`\`\`

## Git commits
- c829e8b - основной функционал
- c161f32 - cleanup

## Статус: ✅ ЗАВЕРШЁН
