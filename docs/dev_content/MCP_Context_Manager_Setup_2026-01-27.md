# MCP Context Manager — рабочие настройки (VS Code / Continue / Antigravity / Docker Stack)

Дата: 2026-01-27 (пути обновлены 2026-06-04)

Этот документ фиксирует **рабочую** конфигурацию MCP Context Manager, настроенную в этой сессии.

## Что важно понимать

- MCP сервер реализован как **stdio**-процесс. После миграции (Block 1) физический путь определяется ОС:
  - **Linux:** `~/.config/iflow/mcp/server.js`
  - **macOS:** `~/Library/Application Support/iflow/mcp/server.js`
  - **Windows:** `%APPDATA%/iflow/mcp/server.js`
- HTTP сервис на `http://localhost:3847` — это **Fastify API** (health + REST endpoints), а не MCP endpoint.
- Поэтому конфигурация вида `type: http`, `url: http://localhost:3847` для MCP **не подходит** (у API нет `/mcp`).

## Проверки, которые подтвердили работоспособность

### 1) Проверка API контейнера

- `GET http://localhost:3847/health` → `200`
- `POST http://localhost:3847/api/context/semantic-search` с телом `{"query":"mcp integration","n":1}` → `200` и валидный результат

### 2) Проверка MCP stdio сервера (initialize + tools/list)

Команда (NDJSON: одно JSON-RPC сообщение на строку):

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
'{"jsonrpc":"2.0","method":"initialized","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| node ~/.config/iflow/mcp/server.js | head -n 40
```

Ожидаемый результат:
- Ответ на `initialize` с `serverInfo: { name: "cm", version: "2.0.0" }`
- `tools/list` возвращает инструменты: `cm_save_br`, `cm_save_im`, `cm_save_fl`, `cm_search`, `cm_query`, `cm_cross`, `cm_agents`, `cm_stats`, `cm_export`, `cm_help`.

## Рабочие конфиги

### Antigravity

Файл:
- `/home/gg/.gemini/antigravity/mcp_config.json`

Содержимое:

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["/home/gg/.iflow/mcp-servers/context-manager/server.js"]
    }
  }
}
```

Проверка записи и валидности JSON:

```bash
test -s /home/gg/.gemini/antigravity/mcp_config.json && \
jq empty /home/gg/.gemini/antigravity/mcp_config.json >/dev/null && \
echo "OK: mcp_config.json записан и валиден"
```

### VS Code / Continue (YAML)

Фрагмент `config.yaml` (Continue):

```yaml
mcpServers:
  - name: context_manager
    type: stdio
    command: node
    args:
      - /home/gg/.iflow/mcp-servers/context-manager/server.js
```

Проверка из Continue: вызов инструмента `context_manager_cm_search`.

### Docker Stack (оркестратор)

Файл:
- `/home/gg/orchestrator/docker-stacks/context-manager/mcp.json`

Содержимое:

```json
{
  "servers": {
    "context-manager": {
      "type": "stdio",
      "command": "/usr/bin/node",
      "args": ["/home/gg/.iflow/mcp-servers/context-manager/server.js"]
    }
  }
}
```

Проверка JSON:

```bash
cat /home/gg/orchestrator/docker-stacks/context-manager/mcp.json | jq -e . >/dev/null && echo OK
```

## Docker Compose сервисы (фактическое состояние)

- `context-manager` контейнер слушает `0.0.0.0:3847->3847/tcp`
- `tei-service` (text-embeddings-inference) слушает `0.0.0.0:8080->80/tcp`

## Типовые ошибки и их причина

- `FST_ERR_VALIDATION: body must have required property 'query'` на `POST /api/context/semantic-search` — запрос был отправлен без обязательного JSON-поля `query`.
