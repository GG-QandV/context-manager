# WIN10 Test Specification — Context Manager Native Stack

> Версия: 1.0 | Дата: 2026-06-05
> Основание: GAPS_AUDIT.md, SPEC_ONNX_EMBEDDER.md, WIN10_ARCHITECTURE_DESIGN.md
> Среда: Windows 10/11, нативный запуск без Docker

---

## Стратегия тестирования

```
Layer 0: Prerequisites   — Python, Node.js, psql, nssm доступны
Layer 1: Infrastructure  — PostgreSQL :5432, Qdrant :6333 живые
Layer 2: Embedder        — ONNX Embedder :8080 изолированно
Layer 3: Context Manager — Node.js API :3847 (зависит от L1 + L2)
Layer 4: MCP             — server.js stdio + cm_http_adapter :8770
Layer 5: Integration     — e2e сохранение и поиск контекста
Layer 6: Regression      — GAP-specific тесты по аудиту
```

Каждый слой тестируется независимо. Слой N не тестируется пока слой N-1 не пройден.

---

## Layer 0 — Prerequisites Check

**Цель:** убедиться что все бинарники доступны из PATH.

```powershell
# T0-01: Node.js
node --version
# Ожидается: v18.x.x или выше

# T0-02: Python
python --version
# Ожидается: Python 3.10.x или выше

# T0-03: psql client
psql --version
# Ожидается: psql (PostgreSQL) 15.x или выше

# T0-04: nssm
nssm version
# Ожидается: NSSM 2.24-101-g897c7ad или выше

# T0-05: onnxruntime в python
python -c "import onnxruntime; print(onnxruntime.__version__)"
# Ожидается: 1.17.0 или выше

# T0-06: Проверить что модель скачана
$modelDir = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
(Get-ChildItem $modelDir -Filter "*.onnx").Count
# Ожидается: 1 или больше

# T0-07: embed_server.py существует
Test-Path "C:\context-manager\embed\embed_server.py"
# Ожидается: True

# T0-08: .env.windows существует
Test-Path "C:\context-manager\.env.windows"
# Ожидается: True

# T0-09: dist/index.js собран
Test-Path "C:\context-manager\dist\index.js"
# Ожидается: True
```

**Критерий прохождения:** все 9 тестов — True / без ошибок.

---

## Layer 1 — Infrastructure

### PostgreSQL

```powershell
# T1-01: TCP порт открыт
$tcp = New-Object System.Net.Sockets.TcpClient
try { $tcp.Connect("127.0.0.1", 5432); "PASS: PG port 5432 open" } catch { "FAIL: $($_.Exception.Message)" }

# T1-02: Аутентификация
psql -U postgres -h 127.0.0.1 -c "SELECT 1 AS ok;"
# Ожидается: ok=1

# T1-03: База данных существует
psql -U postgres -h 127.0.0.1 -c "\l" | Select-String "context_db"
# Ожидается: строка с context_db

# T1-04: Схема применена — таблицы существуют
psql -U postgres -h 127.0.0.1 -d context_db -c "\dt"
# Ожидается: список таблиц (sessions, anchors, experience и т.д.)
```

### Qdrant

```powershell
# T1-05: Health check
Invoke-RestMethod http://127.0.0.1:6333/health
# Ожидается: { "result": "ok", "status": "ok", "time": ... }

# T1-06: Collections доступны (API работает)
Invoke-RestMethod http://127.0.0.1:6333/collections
# Ожидается: { "result": { "collections": [...] }, "status": "ok" }
```

**Критерий прохождения:** T1-01..06 без ошибок.

---

## Layer 2 — ONNX Embedder (изолированный тест)

> Тест запускается ПЕРЕД регистрацией nssm-сервиса — прямой запуск из консоли.
> Это позволяет увидеть ошибки stderr без nssm-оберток.

### Запуск для тестирования

```powershell
cd C:\context-manager\embed
$env:MODEL_DIR = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
python embed_server.py
# Ожидается в stdout:
# INFO: Model loaded: model_optimized.onnx (или другой), inputs: [...]
# INFO: Embedder ready on 127.0.0.1:8080
# INFO: Application startup complete.
```

> Не закрывать — оставить в фоне. Тесты ниже — в новом окне PowerShell.

### Smoke Tests

```powershell
# T2-01: Health check embedder'а
Invoke-RestMethod http://127.0.0.1:8080/health
# Ожидается: { "status": "ok" }

# T2-02: Single embed — проверка формата
$body = '{"inputs": "hello world"}'
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/embed `
     -Body $body -ContentType "application/json"
$r.GetType().Name
# Ожидается: Object[] (массив)

# T2-03: Размерность вектора — 384
$body = '{"inputs": "test"}'
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/embed `
     -Body $body -ContentType "application/json"
$r[0].Count
# Ожидается: 384

# T2-04: Batch embed
$body = '{"inputs": ["first sentence", "second sentence"]}'
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/embed `
     -Body $body -ContentType "application/json"
$r.Count
# Ожидается: 2

# T2-05: Batch — каждый вектор 384
$r[0].Count; $r[1].Count
# Ожидается: 384 / 384

# T2-06: L2 нормализация — норма вектора ≈ 1.0
$body = '{"inputs": "normalization check"}'
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/embed `
     -Body $body -ContentType "application/json"
$norm = [math]::Sqrt(($r[0] | ForEach-Object { $_ * $_ } | Measure-Object -Sum).Sum)
[math]::Round($norm, 4)
# Ожидается: 1.0 (±0.001)

# T2-07: Пустой inputs — 400
try {
    Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/embed `
         -Body '{"inputs": []}' -ContentType "application/json"
} catch {
    $_.Exception.Response.StatusCode
}
# Ожидается: 400 Bad Request

# T2-08: Длинный текст (>512 токенов) — не падает
$long = "слово " * 600
$body = "{`"inputs`": `"$long`"}"
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/embed `
     -Body $body -ContentType "application/json"
$r[0].Count
# Ожидается: 384 (обрезается до MAX_SEQ_LEN=512, не крашится)
```

**Критерий прохождения:** T2-01..08 без ошибок. T2-06 норма в диапазоне [0.999, 1.001].

---

## Layer 3 — Context Manager API

> Убедиться что .env скопирован: `copy C:\context-manager\.env.windows C:\context-manager\.env`
> Embedder (L2) должен быть запущен на :8080.

### Запуск для тестирования

```powershell
cd C:\context-manager
node dist/index.js
# Ожидается: Fastify listening on 127.0.0.1:3847
```

### Health & Readiness

```powershell
# T3-01: /health — Context Manager
$r = Invoke-RestMethod http://127.0.0.1:3847/health
# ВНИМАНИЕ: CM возвращает "healthy" или "degraded", НЕ "ok"
$r.status
# Ожидается: "healthy"

# T3-02: /health при Qdrant-down → "degraded" (не crash)
# (Опционально — тест резилиентности)
# Остановить Qdrant: nssm stop cm-qdrant
# Затем проверить:
# Invoke-RestMethod http://127.0.0.1:3847/health
# Ожидается: { "status": "degraded" } (не 500)
# Запустить снова: nssm start cm-qdrant
```

### CRUD — Session API

```powershell
# T3-03: Создать сессию
$session = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3847/api/context `
    -Body '{"type":"test","brief":"test session","tags":["win10-test"]}' `
    -ContentType "application/json"
$session.id
# Ожидается: UUID (не null)

$sessionId = $session.id

# T3-04: Получить сессию по id
$r = Invoke-RestMethod "http://127.0.0.1:3847/api/context/$sessionId"
$r.id
# Ожидается: тот же UUID

# T3-05: Поиск по тегу
$r = Invoke-RestMethod "http://127.0.0.1:3847/api/context?tags=win10-test"
$r.Count
# Ожидается: >= 1

# T3-06: Семантический поиск
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3847/api/context/search `
    -Body '{"query":"test session","limit":5}' `
    -ContentType "application/json"
$r.Count
# Ожидается: >= 1 (embedder должен вернуть вектор и найти запись)

# T3-07: Удалить сессию
Invoke-RestMethod -Method Delete "http://127.0.0.1:3847/api/context/$sessionId"
# Ожидается: 200 или 204

# T3-08: После удаления — 404
try {
    Invoke-RestMethod "http://127.0.0.1:3847/api/context/$sessionId"
} catch {
    $_.Exception.Response.StatusCode
}
# Ожидается: 404
```

**Критерий прохождения:** T3-01, T3-03..08 — без ошибок. T3-01: status == "healthy".

---

## Layer 4 — MCP

### MCP stdio (server.js)

```powershell
# T4-01: server.js запускается — не падает при старте
# Проверить что GAP-6 исправлен: API_BASE читается из env
$env:CM_API_BASE = "http://127.0.0.1:3847/api/context"
node C:\context-manager\mcp\server.js
# Ожидается: процесс ждет stdin (не падает сразу)
# Ctrl+C для выхода

# T4-02: Проверить что mcp.json содержит абсолютный путь (не "./mcp/server.js")
Get-Content "$env:APPDATA\iflow\context-manager-config.json"
# Или:
Get-Content "C:\context-manager\mcp.json"
# Ожидается: "args": ["C:\\context-manager\\mcp\\server.js"]
# НЕ должно быть: "args": ["./mcp/server.js"]
```

### MCP HTTP Adapter

```powershell
# Запустить адаптер:
$env:CM_API_BASE = "http://127.0.0.1:3847/api/context"
$env:CM_MCP_PORT = "8770"
node C:\context-manager\mcp\cm_http_adapter.mjs

# T4-03: Health / ping адаптера
Invoke-RestMethod http://127.0.0.1:8770/mcp
# Ожидается: 200 (MCP-совместимый ответ, не 500)

# T4-04: Вызов MCP tool через HTTP
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8770/mcp `
    -Body '{"method":"cm_save_br","params":{"content":"test","source":"test"}}' `
    -ContentType "application/json"
$r
# Ожидается: JSON-ответ без ошибки
```

**Критерий прохождения:** T4-01 — процесс не крашится, T4-02 — абсолютный путь, T4-03 — 200.

---

## Layer 5 — End-to-End Integration

**Цель:** симулировать полный цикл работы MCP агента.

```powershell
$base = "http://127.0.0.1:3847/api/context"

# T5-01: Сохранить рабочий контекст
$s1 = Invoke-RestMethod -Method Post -Uri $base `
    -Body '{
        "type": "work",
        "brief": "WIN10 test — embeddings integration",
        "tags": ["integration", "windows", "onnx"],
        "content": "Протестировали ONNX embedder на Windows 10. Все слои прошли."
    }' `
    -ContentType "application/json"
Write-Host "Saved session: $($s1.id)"

# T5-02: Найти через семантику
$search = Invoke-RestMethod -Method Post -Uri "$base/search" `
    -Body '{"query": "ONNX embedder windows", "limit": 5}' `
    -ContentType "application/json"
$found = $search | Where-Object { $_.id -eq $s1.id }
$found -ne $null
# Ожидается: True (сессия найдена через семантический поиск)

# T5-03: Найти через теги
$byTag = Invoke-RestMethod "$base`?tags=integration,onnx"
($byTag | Where-Object { $_.id -eq $s1.id }) -ne $null
# Ожидается: True

# T5-04: Сохранить второй контекст с другой темой
$s2 = Invoke-RestMethod -Method Post -Uri $base `
    -Body '{
        "type": "decision",
        "brief": "PostgreSQL подключен нативно",
        "tags": ["integration", "postgresql"],
        "content": "DATABASE_URL указывает на localhost:5432. Работает."
    }' `
    -ContentType "application/json"

# T5-05: Семантический поиск не смешивает несвязанные темы
$r = Invoke-RestMethod -Method Post -Uri "$base/search" `
    -Body '{"query": "database postgres connection", "limit": 3}' `
    -ContentType "application/json"
$ids = $r | Select-Object -ExpandProperty id
$ids -contains $s2.id
# Ожидается: True (PostgreSQL-сессия найдена по релевантному запросу)

# T5-06: Cleanup
Invoke-RestMethod -Method Delete "$base/$($s1.id)"
Invoke-RestMethod -Method Delete "$base/$($s2.id)"
Write-Host "Integration test complete."
```

**Критерий прохождения:** T5-02 и T5-03 — True (записи находятся через embeddings).

---

## Layer 6 — GAP Regression Tests

Тесты закрытия конкретных багов из GAPS_AUDIT.md.

```powershell
# T6-01: GAP-1 регрессия — DATABASE_URL не содержит Docker DNS
#         Проверить что .env содержит localhost, не имя контейнера
(Get-Content "C:\context-manager\.env") -match "postgresql-postgres-main-1"
# Ожидается: False (Docker DNS отсутствует)

(Get-Content "C:\context-manager\.env") -match "localhost"
# Ожидается: True

# T6-02: GAP-2/GAP-3 регрессия — embed_server.py и модель существуют
Test-Path "C:\context-manager\embed\embed_server.py"  # True
(Get-ChildItem "C:\context-manager\models\multilingual-e5-small_Q8\onnx" -Filter "*.onnx").Count -ge 1  # True

# T6-03: GAP-5 регрессия — mcp.json имеет абсолютный путь
$mcpJson = Get-Content "$env:APPDATA\iflow\context-manager-config.json" | ConvertFrom-Json
$serverArg = $mcpJson.mcpServers.'context-manager'.args[0]
$serverArg -match "^\w:\\"  # Windows absolute path pattern
# Ожидается: True (абсолютный путь)
$serverArg -match "^\.\/"    # relative path
# Ожидается: False

# T6-04: GAP-6 регрессия — server.js читает CM_API_BASE из env
$src = Get-Content "C:\context-manager\mcp\server.js" -Raw
# Строка 6 не должна быть хардкодом
$src -match "process\.env\.CM_API_BASE"
# Ожидается: True

$src -match "= 'http://localhost:3847/api/context';"  # строгий хардкод
# Ожидается: False (дефолт через || допустим, голый хардкод — нет)

# T6-05: GAP-7 — cm_http_adapter.mjs читает env
$adap = Get-Content "C:\context-manager\mcp\cm_http_adapter.mjs" -Raw
$adap -match "process\.env\.CM_API_BASE"
# Ожидается: True

# T6-06: HOST в .env — 127.0.0.1, не 0.0.0.0
(Get-Content "C:\context-manager\.env") -match "HOST=127\.0\.0\.1"
# Ожидается: True
(Get-Content "C:\context-manager\.env") -match "HOST=0\.0\.0\.0"
# Ожидается: False
```

**Критерий прохождения:** все 6 тестов — True/False согласно ожиданиям.

---

## nssm Services — Smoke Tests (после регистрации)

Проверки после запуска всех сервисов через nssm.

```powershell
# T7-01: Все сервисы запущены
@("cm-qdrant", "cm-embed", "cm-api", "cm-mcp", "cm-watchdog") | ForEach-Object {
    $status = (nssm status $_).Trim()
    "$_ : $status"
}
# Ожидается: каждый сервис → "SERVICE_RUNNING"

# T7-02: Проверить что логи пишутся
$logDir = "C:\ProgramData\nssm\logs"
Get-ChildItem $logDir -Filter "*.log" | Select-Object Name, LastWriteTime, Length
# Ожидается: 5 файлов логов, LastWriteTime — недавно, Length > 0

# T7-03: Watchdog работает (есть записи в логе)
Get-Content "C:\ProgramData\nssm\logs\cm-watchdog.log" -Tail 5
# Ожидается: строки вида "INFO watchdog — cm-api OK" или аналог

# T7-04: Порты заняты всеми нужными процессами
@(5432, 6333, 8080, 3847, 8770) | ForEach-Object {
    $conn = netstat -ano | Select-String ":$_ "
    "Port $_ : " + $(if ($conn) { "LISTENING" } else { "FREE (FAIL)" })
}
# Ожидается: все 5 портов — LISTENING

# T7-05: Автозапуск — симулировать рестарт сервиса
nssm restart cm-embed
Start-Sleep -Seconds 5
Invoke-RestMethod http://127.0.0.1:8080/health
# Ожидается: { "status": "ok" } (сервис восстановился)
```

---

## Чеклист перед финальным подтверждением

```
[ ] L0: все prerequisites установлены
[ ] L1: PostgreSQL и Qdrant отвечают
[ ] L2: Embedder возвращает 384-мерные L2-нормированные векторы
[ ] L3: Context Manager /health → "healthy" (не "ok")
[ ] L3: CRUD сессий работает (create / get / search / delete)
[ ] L4: server.js читает CM_API_BASE из env (GAP-6 закрыт)
[ ] L4: mcp.json содержит абсолютный путь (не ./mcp/server.js)
[ ] L5: E2E — сохранённая сессия находится через семантический поиск
[ ] L6: Все 6 GAP regression тестов — ожидаемый результат
[ ] L7: Все 5 nssm сервисов в статусе SERVICE_RUNNING
[ ] L7: Все 5 портов в состоянии LISTENING
```

---

## Известные особенности Windows

| Ситуация | Ожидаемое поведение |
|----------|---------------------|
| `/health` Context Manager | `{"status": "healthy"}` или `{"status": "degraded"}` — НЕ `"ok"` |
| `/health` ONNX Embedder | `{"status": "ok"}` — это embedder, отдельный сервис |
| `/health` Qdrant | `{"result": "ok", "status": "ok"}` |
| Первый embed-запрос после старта | ~200ms из-за JIT прогрева ORT — нормально |
| Watchdog перезапуск | Ждать 5-10 секунд после `nssm restart` перед новым health-check |
| `psql` пароль | Может потребоваться `PGPASSWORD=xxx psql ...` или файл `.pgpass` |
