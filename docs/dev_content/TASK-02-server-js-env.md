# TASK-02 — Исправить `mcp/server.js`: читать CM_API_BASE из env

> Уровень: 🟡 Юниор+  
> Приоритет: P0 (блокирующий)  
> Спека: [GAPS_AUDIT.md](./GAPS_AUDIT.md) → GAP-6

---

## Проблема

`/home/gg/projects/context-manager/mcp/server.js`, строка 6:

```javascript
const API_BASE = 'http://localhost:3847/api/context';  // хардкод, env игнорируется
```

При запуске через nssm переменная `CM_API_BASE` игнорируется.  
`cm_http_adapter.mjs` уже читает env правильно — `server.js` нет.

---

## Что сделать

**Файл:** `mcp/server.js`, строка 6  
**Правка — одна строка:**

```javascript
// БЫЛО:
const API_BASE = 'http://localhost:3847/api/context';

// СТАЛО:
const API_BASE = process.env.CM_API_BASE || 'http://localhost:3847/api/context';
```

Больше ничего не трогать.

---

## Проверка

```powershell
cd /home/gg/projects/context-manager

# Регрессия: строка с process.env присутствует
Select-String -Path mcp/server.js -Pattern "process\.env\.CM_API_BASE"
# Ожидается: 1 совпадение

# Тест запуска без env
node mcp/server.js
# Ждёт stdin, не падает → Ctrl+C

# Тест с env
$env:CM_API_BASE = "http://127.0.0.1:3847/api/context"
node mcp/server.js
# Ждёт stdin, не падает → Ctrl+C
```

## Регрессионный тест

[WIN10_TEST_SPEC.md](./WIN10_TEST_SPEC.md) → T4-01, T6-04
