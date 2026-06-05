# TASK-07 — Обновить README: абсолютный путь `init-mcp-config.mjs`

> Уровень: 🟡 Юниор+  
> Приоритет: P2  
> Спека: [GAPS_AUDIT.md](./GAPS_AUDIT.md) → GAP-5 | [WIN10_IMPLEMENTATION_TASK.md](./WIN10_IMPLEMENTATION_TASK.md) → TASK-07

---

## Проблема

Текущий `mcp.json` в репозитории содержит:
```json
{ "args": ["./mcp/server.js"] }
```

Это **относительный путь** — работает только при запуске Node из директории проекта.  
При запуске IDE (Claude Desktop, Cursor, VS Code) из другого места — путь ломается.

`init-mcp-config.mjs` при запуске генерирует `mcp.json` с **абсолютным путём** — это правильно.  
Но если пользователь не знает что нужно запустить этот скрипт — он использует сырой `mcp.json` из репо.

---

## Что сделать

В файле `/home/gg/projects/context-manager/README.md` добавить секцию (или дополнить существующую):

```markdown
## Windows — настройка MCP

После установки обязательно запустить генерацию MCP конфига:

```powershell
node scripts/init-mcp-config.mjs
```

Это создаёт `mcp.json` с абсолютным путём к `server.js`.  
**Не использовать** `mcp.json` из репозитория напрямую — он содержит относительный путь  
и работает только при запуске из директории проекта.

### Подключение к IDE

**Claude Desktop:**
```powershell
Copy-Item mcp.json "$env:APPDATA\Claude\claude_desktop_config.json"
```

**Cursor / VS Code MCP:**  
Открыть Settings → MCP → указать путь из сгенерированного `mcp.json`.
```

---

## Проверка

```bash
# README содержит упоминание init-mcp-config
grep -c "init-mcp-config" /home/gg/projects/context-manager/README.md
# Ожидается: >= 1
```

## Регрессионный тест

[WIN10_TEST_SPEC.md](./WIN10_TEST_SPEC.md) → T4-02, T6-03
