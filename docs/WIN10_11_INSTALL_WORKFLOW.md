# Context Manager — Windows Install Workflow

> Версия: 2.0 | 2026-06-05
> Назначение: спека для реализации install-native.ps1 + uninstall-native.ps1
> Принцип: каждое действие логируется → лог = манифест для анинсталлера
> ⚠️ CHANGELOG v2.0: исправлены 9 багов из GAPS_AUDIT_WORKFLOW.md

---

## Пути (всегда через константы, без USERPROFILE)

```
[ИСПРАВЛЕНИЕ #1] Путь БОЛЬШЕ НЕ использует $env:USERPROFILE — он ломается при
кириллице или пробелах в имени пользователя Windows. Используем фиксированный
нейтральный путь на системном диске.

Установочная директория:  C:\context-manager\
  app\          — исходники проекта (dist, node_modules, mcp)
  models\       — ONNX модель multilingual-e5-small
  embed\        — Python embedder (embed_server.py, requirements.txt, watchdog_cm.py)
  embed\.venv\  — изолированное виртуальное окружение Python [ИСПРАВЛЕНИЕ #2]
  logs\         — логи сервисов (через nssm)
  install.log   — лог установки (читается анинсталлером)
  install.json  — манифест установки (machine-readable, для анинсталлера)
  postgres_credentials.txt — сгенерированный пароль PostgreSQL

Конфиг MCP (Claude Desktop):  $env:APPDATA\Claude\
  claude_desktop_config.json   [ИСПРАВЛЕНИЕ #8 — папка iflow не существует]

Конфиг .env: C:\context-manager\app\.env

nssm логи (stdout/stderr каждого сервиса):
  C:\context-manager\logs\cm-*.log
```

**Правила путей:**
- Никогда `C:\Program Files` — только `$env:ProgramFiles`
- **Никогда `$env:USERPROFILE`** — может содержать пробелы/кириллицу
- Базовый путь: `$InstallRoot = "C:\context-manager"` — объявить константой в начале скрипта
- Разделитель пути: всегда `Join-Path` или `[IO.Path]::Combine`, никогда строковая конкатенация

---

## Обработка ошибок (Resilient Install) [ИСПРАВЛЕНИЕ #7]

**Замена `$ErrorActionPreference = "Stop"` на ручной `Try-Catch` с продолжением:**

```
[БЫЛО] $ErrorActionPreference = "Stop"  → любая ошибка рушит скрипт
[СТАЛО] $ErrorActionPreference = "Continue" + явный Try-Catch на каждом шаге
```

Классификация ошибок:

| Тип ошибки | Поведение |
|---|---|
| **Критическая** (нет node/python/nssm, нет сети) | STOP + вывод инструкции |
| **Некритическая** (не скачался вспомогательный файл) | WARNING + продолжить |
| **Пропускаемая** (шаг уже выполнен, файл существует) | SKIP + залогировать |

Формат State Machine при сбое:
- Залогировать `[FAIL] Step N: <error>` в `install.log`
- Записать `{"op":"fail","step":N,"error":"<msg>"}` в `install.json` через атомарный append (не перезапись всего файла)
- Продолжить скрипт для независимых шагов (например, сбой npm не мешает скачать qdrant)
- В конце — вывести сводку: что прошло, что упало

---

## Формат лога

Два файла создаются при установке:

### `install.log` — человекочитаемый

```
[2026-06-05 12:00:01] [START ] Installer v2.0 — Context Manager 2.2.1
[2026-06-05 12:00:01] [CHECK ] Node.js: v22.2.0
[2026-06-05 12:00:01] [CHECK ] Python: 3.12.3
[2026-06-05 12:00:01] [CHECK ] nssm: 2.24
[2026-06-05 12:00:02] [DIR   ] Created: C:\context-manager
[2026-06-05 12:00:05] [NSSM  ] Installed service: cm-qdrant -> C:\context-manager\qdrant\qdrant.exe
[2026-06-05 12:01:10] [OK    ] Step 4/9 DONE: ONNX model
[2026-06-05 12:01:11] [WARN  ] Step 5/9 WARN: pip install — exit code 1. Continuing.
[2026-06-05 12:05:00] [END   ] PARTIAL. 7/9 steps OK. See install.log for details.
```

### `install.json` — машиночитаемый манифест

Формат: JSON array, каждый элемент — одна атомарная операция.
Пишется через **атомарный append** (Add-Content), не перезапись Out-File — защита от повреждения при краше.

```json
[
  {"op":"dir_create",    "path":"C:\\context-manager",              "step":1},
  {"op":"dir_create",    "path":"C:\\context-manager\\app",         "step":1},
  {"op":"dir_create",    "path":"C:\\context-manager\\models",      "step":1},
  {"op":"dir_create",    "path":"C:\\context-manager\\embed",       "step":1},
  {"op":"dir_create",    "path":"C:\\context-manager\\logs",        "step":1},
  {"op":"file_copy",     "dst":"C:\\context-manager\\app\\.env",    "step":3},
  {"op":"npm_install",   "dir":"C:\\context-manager\\app",          "step":3},
  {"op":"file_download", "dst":"C:\\context-manager\\qdrant\\qdrant.exe", "step":2},
  {"op":"model_download","dst":"C:\\context-manager\\models",       "step":4},
  {"op":"venv_create",   "dir":"C:\\context-manager\\embed\\.venv", "step":5},
  {"op":"pip_install",   "dir":"C:\\context-manager\\embed",        "step":5},
  {"op":"nssm_install",  "service":"cm-qdrant",   "step":6},
  {"op":"nssm_install",  "service":"cm-embed",    "step":6},
  {"op":"nssm_install",  "service":"cm-api",      "step":6},
  {"op":"nssm_install",  "service":"cm-mcp",      "step":6},
  {"op":"nssm_install",  "service":"cm-watchdog", "step":6},
  {"op":"mcp_json",      "path":"C:\\Users\\<user>\\AppData\\Roaming\\Claude\\claude_desktop_config.json", "step":7},
  {"op":"complete",      "version":"2.2.1",       "ts":"2026-06-05T12:01:11Z"}
]
```

**Правило записи:** каждый `op` пишется ПОСЛЕ успешного выполнения.
Если шаг падает — пишется `{"op":"fail", "step":N, "error":"..."}` и скрипт **продолжает** (не останавливается для некритичных ошибок).

---

## Чеклист шагов установки

### Шаг 0 — Проверка prerequisites
**Логируется:** `[CHECK]` для каждого бинарника

```
[ ] 0.1  node --version         → >= 18.0.0
[ ] 0.2  python --version       → >= 3.10
[ ] 0.3  pip --version          → любая
[ ] 0.4  nssm version           → >= 2.24
[ ] 0.5  psql --version         → >= 14  (PostgreSQL клиент в PATH)
[ ] 0.6  pg: TCP 127.0.0.1:5432 открыт  (PostgreSQL уже установлен и запущен)
[ ] 0.7  база данных context_db существует
```

**Если 0.1/0.2/0.3/0.4 нет** → winget установить автоматически. Если winget тоже недоступен → STOP с инструкцией.
**Если 0.5/0.6 нет** → выполнить тихую установку PostgreSQL с генерацией пароля (см. Шаг 0-PG ниже).
**Если 0.7 нет** → создать базу ЧЕРЕЗ PGPASSWORD (не интерактивно):

```powershell
# [ИСПРАВЛЕНИЕ #3] — PGPASSWORD вместо интерактивного ввода
$env:PGPASSWORD = $pgPassword
& psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE context_db;" 2>&1
Remove-Item Env:\PGPASSWORD
```

### Шаг 0-PG — Тихая установка PostgreSQL (если нет)

```powershell
function Get-RandomPassword {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#"
    -join ((1..16) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

$pgPassword = Get-RandomPassword

# Тихая установка через winget с передачей пароля
$overrideArgs = "--mode unattended --unattendedmodeui none --superpassword `"$pgPassword`" --serverport 5432"
winget install --id PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements --override $overrideArgs

# Обновить PATH немедленно
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

# Сохранить в файл ДО создания .env (на случай краша)
"Auto-generated password for PostgreSQL (user: postgres):`n$pgPassword" |
    Out-File -FilePath (Join-Path $InstallRoot "postgres_credentials.txt") -Encoding UTF8
```

---

### Шаг 1 — Создание директорий
**Логируется:** `[DIR]` + путь для каждой директории

```
[ ] 1.1  C:\context-manager\
[ ] 1.2  C:\context-manager\app\
[ ] 1.3  C:\context-manager\models\
[ ] 1.4  C:\context-manager\embed\
[ ] 1.5  C:\context-manager\logs\
[ ] 1.6  C:\context-manager\qdrant\
[ ] 1.7  $env:APPDATA\Claude\      (для MCP конфига)
```

Манифест: `op=dir_create` для каждой.
Анинсталлер: `Remove-Item -Recurse` в обратном порядке.

---

### Шаг 2 — Qdrant
**Логируется:** `[DOWNLOAD]`, `[VERIFY]`, `[FILE]`

```
[ ] 2.1  Определить последний релиз (захардкодить конкретную версию v1.13.x для стабильности)
[ ] 2.2  Скачать qdrant-x86_64-pc-windows-msvc.zip → $env:TEMP\qdrant-download.zip
[ ] 2.3  Распаковать через Shell.Application (быстрее, с прогрессом): [ИСПРАВЛЕНИЕ #9]
         → C:\context-manager\qdrant\qdrant.exe
[ ] 2.4  Верификация: qdrant.exe --version выводит версию
[ ] 2.5  Создать qdrant storage dir: C:\context-manager\qdrant\storage\
[ ] 2.6  Удалить zip из $env:TEMP
```

```powershell
# [ИСПРАВЛЕНИЕ #9] — Shell.Application вместо Expand-Archive для скорости и прогресса
$shell = New-Object -ComObject Shell.Application
$zip   = $shell.NameSpace("$env:TEMP\qdrant-download.zip")
$dest  = $shell.NameSpace("C:\context-manager\qdrant")
$dest.CopyHere($zip.Items(), 0x14)  # 0x14 = без UI + без подтверждений
```

---

### Шаг 3 — Проект (robocopy + npm + .env + MCP config)
**Логируется:** `[COPY]`, `[NPM]`, `[BUILD]`, `[ENV]`, `[MCP]`

```
[ ] 3.1  Скопировать исходники проекта в app\ [ИСПРАВЛЕНИЕ #4]
         ИСПОЛЬЗОВАТЬ robocopy, НЕ Copy-Item -Recurse -Exclude (он сломан в PS):

         robocopy $PSScriptRoot\.. C:\context-manager\app /E /NFL /NDL /NJH /NJS
             /XD node_modules dist .git .venv __pycache__
             /XF *.log .env

[ ] 3.2  Создать .env из .env.windows с подстановкой пароля
         → C:\context-manager\app\.env
[ ] 3.3  npm install (из C:\context-manager\app\)
[ ] 3.4  npm run build (TypeScript → dist/)
[ ] 3.5  Генерация claude_desktop_config.json [ИСПРАВЛЕНИЕ #8]
[ ] 3.6  (опционально) Скопировать server.js в стандартный путь Claude Desktop
```

**Генерация MCP config для Claude Desktop (ИСПРАВЛЕНИЕ #8):**

```powershell
$nodePath     = (Get-Command node -ErrorAction SilentlyContinue).Source
$serverJsPath = "C:\context-manager\app\mcp\server.js"

# Путь для Claude Desktop (стандартный)
$claudeConfigDir  = Join-Path $env:APPDATA "Claude"
$claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"

New-Item -ItemType Directory -Force -Path $claudeConfigDir | Out-Null

$mcpConfig = @{
    mcpServers = @{
        "context-manager" = @{
            command = $nodePath
            args    = @($serverJsPath)
        }
    }
} | ConvertTo-Json -Depth 5

$mcpConfig | Out-File -FilePath $claudeConfigPath -Encoding UTF8 -NoNewline
```

---

### Шаг 4 — ONNX модель
**Логируется:** `[MODEL]`, `[VERIFY]`

```
[ ] 4.1  pip install huggingface_hub (в глобальный pip или через venv из шага 5)
[ ] 4.2  Скачать модель intfloat/multilingual-e5-small
         → C:\context-manager\models\multilingual-e5-small_Q8\onnx\
         Паттерны: *.onnx, tokenizer*, config.json, special_tokens*, vocab*
[ ] 4.3  Верификация: хотя бы один .onnx файл существует
[ ] 4.4  Верификация: tokenizer.json существует
```

Модель **публичная, регистрация на HuggingFace не требуется**.

---

### Шаг 5 — Python embedder с виртуальным окружением [ИСПРАВЛЕНИЕ #2]

**Логируется:** `[VENV]`, `[COPY]`, `[PIP]`, `[VERIFY]`

```
[ ] 5.1  Скопировать embed_server.py → C:\context-manager\embed\
[ ] 5.2  Скопировать requirements.txt → C:\context-manager\embed\
[ ] 5.3  Скопировать watchdog_cm.py → C:\context-manager\embed\

[ ] 5.4  Создать venv (ОБЯЗАТЕЛЬНО — защита от PEP 668 и конфликтов):
         python -m venv C:\context-manager\embed\.venv

[ ] 5.5  Установить зависимости В VENV (не в глобальный Python):
         C:\context-manager\embed\.venv\Scripts\pip.exe install -r requirements.txt

[ ] 5.6  Тест-запуск: .venv\Scripts\python.exe -c "import onnxruntime, fastapi, tokenizers; print('OK')"
[ ] 5.7  Быстрый smoke тест embedder'а: запуск → /health → остановка
```

**ВАЖНО для нссм (Шаг 6):** путь к python.exe для служб теперь:
`C:\context-manager\embed\.venv\Scripts\python.exe`

---

### Шаг 6 — nssm сервисы [ИСПРАВЛЕНИЕ #5, #6]

Перед регистрацией — проверить что сервис не существует.
Если существует → `nssm stop` + `nssm remove <name> confirm` → затем регистрировать заново.

**[ИСПРАВЛЕНИЕ #5] — AppEnvironmentExtra: передавать все переменные ОДНИМ вызовом:**

```powershell
# НЕПРАВИЛЬНО — каждый вызов перезаписывает предыдущий:
# nssm set cm-embed AppEnvironmentExtra "VAR1=val1"
# nssm set cm-embed AppEnvironmentExtra "VAR2=val2"  ← ЗАТИРАЕТ VAR1

# ПРАВИЛЬНО — все переменные одним вызовом:
nssm set cm-embed AppEnvironmentExtra "MODEL_DIR=C:\context-manager\models\multilingual-e5-small_Q8\onnx"
```

**[ИСПРАВЛЕНИЕ #6] — DependOnService для правильного порядка запуска после ребута:**

```
[ ] 6.1  cm-qdrant
         exe:  C:\context-manager\qdrant\qdrant.exe
         args: --uri http://127.0.0.1:6333
         dir:  C:\context-manager\qdrant\
         env:  (нет)
         log:  C:\context-manager\logs\cm-qdrant.log
         depend: (нет)

[ ] 6.2  cm-embed
         exe:  C:\context-manager\embed\.venv\Scripts\python.exe  ← venv python!
         args: -m uvicorn embed_server:app --host 127.0.0.1 --port 8080
         dir:  C:\context-manager\embed\
         env:  MODEL_DIR=C:\context-manager\models\multilingual-e5-small_Q8\onnx
         log:  C:\context-manager\logs\cm-embed.log
         depend: cm-qdrant

[ ] 6.3  cm-api
         exe:  <node path>
         args: dist\index.js
         dir:  C:\context-manager\app\
         # НЕ передавать .env переменные через nssm — Node.js читает .env сам [ИСПРАВЛЕНИЕ #5]
         log:  C:\context-manager\logs\cm-api.log
         depend: cm-qdrant, cm-embed

[ ] 6.4  cm-mcp
         exe:  <node path>
         args: mcp\cm_http_adapter.mjs
         dir:  C:\context-manager\app\
         env:  CM_API_BASE=http://127.0.0.1:3847/api/context  CM_MCP_PORT=8770
         log:  C:\context-manager\logs\cm-mcp.log
         depend: cm-api

[ ] 6.5  cm-watchdog
         exe:  C:\context-manager\embed\.venv\Scripts\python.exe  ← venv python!
         args: watchdog_cm.py
         dir:  C:\context-manager\embed\
         log:  C:\context-manager\logs\cm-watchdog.log
         depend: cm-api
```

**Установка DependOnService через реестр:**
```powershell
# nssm не имеет прямой команды DependOnService, устанавливаем через реестр:
$svcKey = "HKLM:\SYSTEM\CurrentControlSet\Services\cm-api"
Set-ItemProperty -Path $svcKey -Name "DependOnService" -Value @("cm-qdrant","cm-embed") -Type MultiString
```

**nssm параметры (все сервисы):**
```
AppRotateFiles    1
AppRotateSeconds  86400     (ротация каждые сутки)
AppRotateBytes    10485760  (10 MB max per log)
Start             SERVICE_AUTO_START
```

---

### Шаг 7 — Запуск сервисов и smoke test

Порядок запуска с ожиданием готовности (TCP connect loop, не Start-Sleep):

```
[ ] 7.1  nssm start cm-qdrant → ждать TCP:6333 (max 30s)
         HEALTH: GET http://127.0.0.1:6333/health → status="ok"

[ ] 7.2  nssm start cm-embed  → ждать TCP:8080 (max 90s — загрузка ONNX модели)
         HEALTH: GET http://127.0.0.1:8080/health → {"status":"ok"}
         TEST:   POST /embed {"inputs":"test"} → dim=384

[ ] 7.3  nssm start cm-api    → ждать TCP:3847 (max 30s)
         HEALTH: GET http://127.0.0.1:3847/health → status="healthy"|"degraded"
         ACCEPT: "degraded" если Qdrant ещё не синхронизировался

[ ] 7.4  nssm start cm-mcp    → ждать TCP:8770 (max 15s)

[ ] 7.5  nssm start cm-watchdog (без health check — daemon)
```

**TCP wait loop (не Start-Sleep):**
```powershell
function Wait-TcpPort($port, $timeoutSec = 30) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("127.0.0.1", $port)
            $tcp.Close()
            return $true
        } catch { Start-Sleep -Milliseconds 500 }
    }
    return $false
}
```

---

### Шаг 8 — Кнопки управления (BAT-файлы)

```
[ ] 8.1  C:\context-manager\cm-off.bat
[ ] 8.2  C:\context-manager\cm-restart.bat
```

Оба файла:
- Проверяют права администратора через `net session`
- Если нет прав — поднимают UAC через `Start-Process -Verb RunAs`
- Используют `timeout /t 2 /nobreak >nul` вместо `pause` — окно не зависает

---

### Шаг 9 — Финальный манифест и вывод

```
[ ] 9.1  Записать op=complete в install.json
[ ] 9.2  Вывести итоговую таблицу (порты, пути, команды)
[ ] 9.3  Если были Warning на шагах — повторить их сводкой здесь
[ ] 9.4  Вывести путь к postgres_credentials.txt
```

Вывод пользователю:
```
=== Context Manager 2.2.1 installed ===

Services:
  cm-qdrant   :6333  SERVICE_RUNNING
  cm-embed    :8080  SERVICE_RUNNING
  cm-api      :3847  SERVICE_RUNNING
  cm-mcp      :8770  SERVICE_RUNNING
  cm-watchdog  —     SERVICE_RUNNING

MCP config for Claude Desktop:
  %APPDATA%\Claude\claude_desktop_config.json

PostgreSQL credentials:
  C:\context-manager\postgres_credentials.txt

Logs:
  C:\context-manager\logs\

Manage:
  C:\context-manager\cm-restart.bat
  C:\context-manager\cm-off.bat

Uninstall:
  powershell -File C:\context-manager\scripts\uninstall-native.ps1
```

---

## Воркфлоу анинсталлера (на основе install.json)

Анинсталлер читает `install.json` в обратном порядке массива.
Если `install.json` поврежден (краш при записи) → fallback: перебрать список известных сервисов и папок вручную.

### Операции в обратном порядке

| op | Действие анинсталлера |
|----|----------------------|
| `complete` | пропустить |
| `mcp_json` | удалить/восстановить файл по `path` |
| `nssm_install` | `nssm stop <service>` → `nssm remove <service> confirm` |
| `pip_install` | пропустить (удалить через venv целиком) |
| `venv_create` | `Remove-Item -Recurse C:\context-manager\embed\.venv` |
| `model_download` | `Remove-Item -Recurse <dst>` (спросить пользователя) |
| `file_download` | `Remove-Item <dst>` |
| `file_copy` | `Remove-Item <dst>` |
| `npm_install` | `Remove-Item -Recurse app\node_modules`, `app\dist` |
| `dir_create` | `Remove-Item <path>` если пустая |

### Чеклист анинсталлера

```
[ ] A.1  Прочитать install.json → если поврежден: fallback на хардкоженный список сервисов
[ ] A.2  Остановить и удалить nssm сервисы:
         порядок: cm-watchdog → cm-mcp → cm-api → cm-embed → cm-qdrant
[ ] A.3  Убрать DependOnService записи из реестра
[ ] A.4  Спросить: удалить модель? (38+ MB, долго качается)
[ ] A.5  Спросить: удалить базу данных context_db? (psql DROP DATABASE через PGPASSWORD)
[ ] A.6  Удалить файлы по манифесту (file_copy, file_download, mcp_json)
[ ] A.7  Удалить %APPDATA%\Claude\claude_desktop_config.json (или восстановить резервную копию)
[ ] A.8  Удалить директории из манифеста (dir_create) в обратном порядке
[ ] A.9  Вывод: что удалено, что оставлено
```

**Лог анинсталлера:** `C:\context-manager\uninstall.log`
(Пишется до удаления директории — последнее действие удаляет саму папку `C:\context-manager`)

---

## Особенности Windows (любой язык системы)

| Что | Правило |
|-----|---------|
| Базовый путь | `$InstallRoot = "C:\context-manager"` — никогда USERPROFILE |
| Путь к node.exe | `(Get-Command node).Source` — никогда хардкод |
| Путь к python.exe | `C:\context-manager\embed\.venv\Scripts\python.exe` (venv) |
| Путь к psql.exe | `(Get-Command psql).Source` |
| Путь к pip | `C:\context-manager\embed\.venv\Scripts\pip.exe` |
| Program Files | `$env:ProgramFiles` — работает на всех языках |
| Кодировка лога | UTF-8 with BOM (PowerShell default) |
| Слеши в путях | `Join-Path` или `[IO.Path]::Combine` — никогда `\` в строках |
| HTTP-запросы | `Invoke-WebRequest` с `-UseBasicParsing` (нет IE engine dependency) |
| Распаковка ZIP | `Shell.Application.CopyHere` — быстрее чем `Expand-Archive` |
| Ожидание порта | TCP connect loop, не `Start-Sleep` с фиксированным временем |
| Переменные NSSM | Все переменные одним вызовом `AppEnvironmentExtra`, не по одной |
| .env для Node.js | Node читает `.env` сам — не прошивать в NSSM реестр |
| createdb/psql | Использовать `$env:PGPASSWORD` — не интерактивный ввод |
| Копирование файлов | `robocopy` с `/XD /XF` — не `Copy-Item -Recurse -Exclude` |
| Порядок запуска | `DependOnService` в реестре — не рассчитывать на ручной порядок |
| Права админа | Проверять в начале скрипта через `[Security.Principal.WindowsPrincipal]` |
