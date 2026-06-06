# Context Manager — Windows Install Workflow

> Версия: 3.0 | 2026-06-05
> Назначение: спека для реализации install-native.ps1 + uninstall-native.ps1
> Принцип: каждое действие логируется → лог = манифест для анинсталлера
> ⚠️ CHANGELOG v3.0: единый стандарт путей — $env:ProgramFiles / $env:ProgramData, никаких хардкодов

---

## Структура путей (Windows Native Standard)

```
Бинарники/код приложения  →  $env:ProgramFiles\context-manager\
  app\           — Node.js проект (dist, mcp, node_modules)
  qdrant\        — qdrant.exe + storage\
  embed\         — Python embed_server.py, watchdog_cm.py
  embed\.venv\   — изолированное виртуальное окружение Python

Runtime данные / конфиги  →  $env:ProgramData\context-manager\
  models\        — ONNX модель multilingual-e5-small_Q8
  logs\          — логи сервисов (nssm stdout/stderr)
  app\.env       — конфигурация (DATABASE_URL, порты)
  install.log    — лог установки (читается анинсталлером)
  install.json   — манифест установки (machine-readable)
  postgres_credentials.txt — сгенерированный пароль PostgreSQL

MCP конфиг (Claude Desktop)  →  $env:APPDATA\Claude\
  claude_desktop_config.json
```

**В начале скрипта объявить переменные (не хардкодить нигде в коде):**
```powershell
$InstallBin  = Join-Path $env:ProgramFiles  "context-manager"
$InstallData = Join-Path $env:ProgramData   "context-manager"
$InstallApp  = Join-Path $InstallBin        "app"
$InstallEmb  = Join-Path $InstallBin        "embed"
$InstallQdr  = Join-Path $InstallBin        "qdrant"
$InstallMod  = Join-Path $InstallData       "models"
$InstallLogs = Join-Path $InstallData       "logs"
$InstallEnv  = Join-Path $InstallData       "app\.env"
$VenvPython  = Join-Path $InstallEmb        ".venv\Scripts\python.exe"
$VenvPip     = Join-Path $InstallEmb        ".venv\Scripts\pip.exe"
```

**Правила путей:**
- **Никогда `$env:USERPROFILE`** — содержит пробелы/кириллицу
- **Никогда хардкод `C:\`** — не у всех системный диск на C:
- **Никогда `$env:ProgramData` для бинарей** — только для data/config/logs
- **Никогда `$env:ProgramFiles` для данных** — только для исполняемых файлов
- Разделитель пути: всегда `Join-Path` или `[IO.Path]::Combine`

---

## Обработка ошибок (Resilient Install)

**Замена `$ErrorActionPreference = "Stop"` на ручной `Try-Catch`:**

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
- Записать `{"op":"fail","step":N,"error":"<msg>"}` в `install.json` через атомарный append
- Продолжить скрипт для независимых шагов
- В конце — вывести сводку: что прошло, что упало

---

## Формат лога

### `install.log` — человекочитаемый

```
[2026-06-05 12:00:01] [START ] Installer v3.0 — Context Manager 2.2.1
[2026-06-05 12:00:01] [CHECK ] Node.js: v22.2.0
[2026-06-05 12:00:01] [CHECK ] Python: 3.12.3
[2026-06-05 12:00:01] [CHECK ] nssm: 2.24
[2026-06-05 12:00:02] [DIR   ] Created: C:\Program Files\context-manager
[2026-06-05 12:00:02] [DIR   ] Created: C:\ProgramData\context-manager
[2026-06-05 12:00:05] [NSSM  ] Installed service: cm-qdrant -> C:\Program Files\context-manager\qdrant\qdrant.exe
[2026-06-05 12:01:10] [OK    ] Step 4/9 DONE: ONNX model
[2026-06-05 12:01:11] [WARN  ] Step 5/9 WARN: pip install — exit code 1. Continuing.
[2026-06-05 12:05:00] [END   ] PARTIAL. 7/9 steps OK. See install.log for details.
```

### `install.json` — машиночитаемый манифест

Формат: JSON array. Пишется через **атомарный append** (Add-Content), не перезапись Out-File.
Пути в JSON — всегда реальные развёрнутые пути (через `$InstallBin`, `$InstallData` и т.д.):

```json
[
  {"op":"dir_create",    "path":"<$InstallBin>",                   "step":1},
  {"op":"dir_create",    "path":"<$InstallBin>\\app",              "step":1},
  {"op":"dir_create",    "path":"<$InstallBin>\\qdrant",           "step":1},
  {"op":"dir_create",    "path":"<$InstallBin>\\embed",            "step":1},
  {"op":"dir_create",    "path":"<$InstallData>",                  "step":1},
  {"op":"dir_create",    "path":"<$InstallData>\\models",          "step":1},
  {"op":"dir_create",    "path":"<$InstallData>\\logs",            "step":1},
  {"op":"file_copy",     "dst":"<$InstallData>\\app\\.env",        "step":3},
  {"op":"npm_install",   "dir":"<$InstallBin>\\app",               "step":3},
  {"op":"file_download", "dst":"<$InstallBin>\\qdrant\\qdrant.exe","step":2},
  {"op":"model_download","dst":"<$InstallData>\\models",           "step":4},
  {"op":"venv_create",   "dir":"<$InstallBin>\\embed\\.venv",      "step":5},
  {"op":"pip_install",   "dir":"<$InstallBin>\\embed",             "step":5},
  {"op":"nssm_install",  "service":"cm-qdrant",                    "step":6},
  {"op":"nssm_install",  "service":"cm-embed",                     "step":6},
  {"op":"nssm_install",  "service":"cm-api",                       "step":6},
  {"op":"nssm_install",  "service":"cm-mcp",                       "step":6},
  {"op":"nssm_install",  "service":"cm-watchdog",                  "step":6},
  {"op":"mcp_json",      "path":"<$env:APPDATA>\\Claude\\claude_desktop_config.json", "step":7},
  {"op":"complete",      "version":"2.2.1",                        "ts":"<timestamp>"}
]
```

> Примечание: `<$InstallBin>` и `<$InstallData>` — это реальные развёрнутые пути времени установки, не шаблонные переменные. JSON создаётся уже с подставленными значениями.

**Правило записи:** каждый `op` пишется ПОСЛЕ успешного выполнения.
Если шаг падает — пишется `{"op":"fail", "step":N, "error":"..."}` и скрипт **продолжает**.

---

## Чеклист шагов установки

### Шаг 0 — Проверка prerequisites + прав администратора

**Первое, что делает скрипт — проверка прав:**
```powershell
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "ERROR: запустите скрипт как Administrator." -ForegroundColor Red
    Start-Process powershell -Verb RunAs -ArgumentList "-File `"$PSCommandPath`""
    exit
}
```

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
**Если 0.7 нет** → создать базу через PGPASSWORD (не интерактивно):

```powershell
# PGPASSWORD вместо интерактивного ввода — иначе скрипт зависнет
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

# Тихая установка через winget
$overrideArgs = "--mode unattended --unattendedmodeui none --superpassword `"$pgPassword`" --serverport 5432"
winget install --id PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements --override $overrideArgs

# Обновить PATH немедленно без перезапуска сессии
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

# Сохранить пароль ДО создания .env (на случай краша)
$credsPath = Join-Path $InstallData "postgres_credentials.txt"
"Auto-generated password for PostgreSQL (user: postgres):`n$pgPassword" |
    Out-File -FilePath $credsPath -Encoding UTF8
```

---

### Шаг 1 — Создание директорий

**Логируется:** `[DIR]` + путь для каждой директории

```
[ ] 1.1  $InstallBin   ($env:ProgramFiles\context-manager)
[ ] 1.2  $InstallApp   ($env:ProgramFiles\context-manager\app)
[ ] 1.3  $InstallQdr   ($env:ProgramFiles\context-manager\qdrant)
[ ] 1.4  $InstallEmb   ($env:ProgramFiles\context-manager\embed)
[ ] 1.5  $InstallData  ($env:ProgramData\context-manager)
[ ] 1.6  $InstallMod   ($env:ProgramData\context-manager\models)
[ ] 1.7  $InstallLogs  ($env:ProgramData\context-manager\logs)
[ ] 1.8  $env:APPDATA\Claude\   (для MCP конфига Claude Desktop)
```

```powershell
@($InstallBin, $InstallApp, $InstallQdr, $InstallEmb,
  $InstallData, $InstallMod, $InstallLogs,
  (Join-Path $env:APPDATA "Claude")) | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
}
```

Манифест: `op=dir_create` для каждой.
Анинсталлер: `Remove-Item -Recurse` в обратном порядке.

---

### Шаг 2 — Qdrant

**Логируется:** `[DOWNLOAD]`, `[VERIFY]`, `[FILE]`

```
[ ] 2.1  Захардкодить конкретную версию (например, v1.13.1) — не "latest"
         (latest → нестабильный URL, ломается при смене версии)
[ ] 2.2  Скачать qdrant-x86_64-pc-windows-msvc.zip
         → $env:TEMP\qdrant-download.zip
[ ] 2.3  Распаковать через Shell.Application (быстрее Expand-Archive, с прогрессом)
         → $InstallQdr\qdrant.exe
[ ] 2.4  Верификация: qdrant.exe --version выводит версию
[ ] 2.5  Создать storage dir: $InstallQdr\storage\
[ ] 2.6  Удалить zip из $env:TEMP
```

```powershell
# Shell.Application — быстрее и показывает прогресс в отличие от Expand-Archive
$qdrantZip  = Join-Path $env:TEMP "qdrant-download.zip"
$qdrantDest = $InstallQdr

$shell = New-Object -ComObject Shell.Application
$zip   = $shell.NameSpace($qdrantZip)
$dest  = $shell.NameSpace($qdrantDest)
$dest.CopyHere($zip.Items(), 0x14)  # 0x14 = без UI диалогов + без подтверждений

Remove-Item $qdrantZip -Force
```

---

### Шаг 3 — Проект (robocopy + npm + .env + MCP config)

**Логируется:** `[COPY]`, `[NPM]`, `[BUILD]`, `[ENV]`, `[MCP]`

```
[ ] 3.1  Скопировать исходники проекта в $InstallApp\
         ИСПОЛЬЗОВАТЬ robocopy, НЕ Copy-Item -Recurse -Exclude
         (Copy-Item -Exclude исторически сломан — не работает на вложенных папках):

         robocopy "$PSScriptRoot\.." "$InstallApp" /E /NFL /NDL /NJH /NJS `
             /XD node_modules dist .git .venv __pycache__ embed `
             /XF *.log .env

[ ] 3.2  Создать .env из .env.windows с подстановкой пароля
         → $InstallData\app\.env   (данные — в ProgramData, не в ProgramFiles)
[ ] 3.3  npm install (из $InstallApp\)
[ ] 3.4  npm run build (TypeScript → dist/)
[ ] 3.5  Генерация claude_desktop_config.json для Claude Desktop
```

**Генерация MCP config для Claude Desktop:**

```powershell
$nodePath     = (Get-Command node -ErrorAction SilentlyContinue).Source
$serverJsPath = Join-Path $InstallApp "mcp\server.js"

$claudeConfigDir  = Join-Path $env:APPDATA "Claude"
$claudeConfigPath = Join-Path $claudeConfigDir "claude_desktop_config.json"

New-Item -ItemType Directory -Force -Path $claudeConfigDir | Out-Null

# Если claude_desktop_config.json уже существует — сделать резервную копию
if (Test-Path $claudeConfigPath) {
    Copy-Item $claudeConfigPath "$claudeConfigPath.bak" -Force
}

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
[ ] 4.1  pip install huggingface_hub (через venv из шага 5 или глобально если venv ещё нет)
[ ] 4.2  Скачать модель intfloat/multilingual-e5-small
         → $InstallMod\multilingual-e5-small_Q8\onnx\
         Паттерны: *.onnx, tokenizer*, config.json, special_tokens*, vocab*
[ ] 4.3  Верификация: хотя бы один .onnx файл существует
[ ] 4.4  Верификация: tokenizer.json существует
```

Модель **публичная, регистрация на HuggingFace не требуется**.

```powershell
$modelDir = Join-Path $InstallMod "multilingual-e5-small_Q8\onnx"
New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

# Через venv python если уже создан, иначе через системный
$pyExe = if (Test-Path $VenvPython) { $VenvPython } else { "python" }
& $pyExe -m huggingface_hub download intfloat/multilingual-e5-small `
    --local-dir $modelDir `
    --include "*.onnx" "tokenizer*" "config.json" "special_tokens*" "vocab*"
```

---

### Шаг 5 — Python embedder с виртуальным окружением

**Логируется:** `[VENV]`, `[COPY]`, `[PIP]`, `[VERIFY]`

```
[ ] 5.1  Скопировать embed_server.py  → $InstallEmb\
[ ] 5.2  Скопировать requirements.txt → $InstallEmb\
[ ] 5.3  Скопировать watchdog_cm.py   → $InstallEmb\

[ ] 5.4  Создать venv (ОБЯЗАТЕЛЬНО — защита от PEP 668 и конфликтов версий):
         python -m venv "$InstallEmb\.venv"

[ ] 5.5  Установить зависимости В VENV (не в глобальный Python):
         & $VenvPip install -r "$InstallEmb\requirements.txt"

[ ] 5.6  Тест импорта:
         & $VenvPython -c "import onnxruntime, fastapi, tokenizers; print('OK')"

[ ] 5.7  Smoke тест embedder'а: запуск → GET /health → остановка
```

```powershell
$venvDir = Join-Path $InstallEmb ".venv"
python -m venv $venvDir

$VenvPip    = Join-Path $venvDir "Scripts\pip.exe"
$VenvPython = Join-Path $venvDir "Scripts\python.exe"

& $VenvPip install -r (Join-Path $InstallEmb "requirements.txt")

# Проверка
$check = & $VenvPython -c "import onnxruntime, fastapi, tokenizers; print('OK')" 2>&1
if ($check -ne "OK") { Write-Warning "pip install: некоторые пакеты не установлены" }
```

**ВАЖНО для шага 6 (nssm):** путь к python.exe для сервисов:
`$VenvPython` = `$env:ProgramFiles\context-manager\embed\.venv\Scripts\python.exe`

---

### Шаг 6 — nssm сервисы

Перед регистрацией — проверить что сервис не существует.
Если существует → `nssm stop` + `nssm remove <name> confirm` → регистрировать заново.

**AppEnvironmentExtra: передавать все переменные ОДНИМ вызовом:**
```powershell
# НЕПРАВИЛЬНО — каждый вызов перезаписывает предыдущий в реестре:
# nssm set cm-embed AppEnvironmentExtra "VAR1=val1"
# nssm set cm-embed AppEnvironmentExtra "VAR2=val2"  ← ЗАТИРАЕТ VAR1

# ПРАВИЛЬНО — все переменные передать одним вызовом (через пробел):
nssm set cm-embed AppEnvironmentExtra "MODEL_DIR=$(Join-Path $InstallMod 'multilingual-e5-small_Q8\onnx')"
```

**DependOnService для правильного порядка запуска после ребута:**

```
[ ] 6.1  cm-qdrant
         exe:    $InstallQdr\qdrant.exe
         args:   --uri http://127.0.0.1:6333
         dir:    $InstallQdr\
         env:    (нет)
         stdout: $InstallLogs\cm-qdrant.log
         stderr: $InstallLogs\cm-qdrant-err.log
         depend: (нет — первый в цепочке)

[ ] 6.2  cm-embed
         exe:    $VenvPython
         args:   -m uvicorn embed_server:app --host 127.0.0.1 --port 8080
         dir:    $InstallEmb\
         env:    MODEL_DIR=$InstallMod\multilingual-e5-small_Q8\onnx
         stdout: $InstallLogs\cm-embed.log
         stderr: $InstallLogs\cm-embed-err.log
         depend: cm-qdrant

[ ] 6.3  cm-api
         exe:    <node path>
         args:   dist\index.js
         dir:    $InstallApp\
         env:    (нет — Node.js читает .env из $InstallData\app\.env сам)
         stdout: $InstallLogs\cm-api.log
         stderr: $InstallLogs\cm-api-err.log
         depend: cm-qdrant, cm-embed

[ ] 6.4  cm-mcp
         exe:    <node path>
         args:   mcp\cm_http_adapter.mjs
         dir:    $InstallApp\
         env:    CM_API_BASE=http://127.0.0.1:3847/api/context CM_MCP_PORT=8770
         stdout: $InstallLogs\cm-mcp.log
         stderr: $InstallLogs\cm-mcp-err.log
         depend: cm-api

[ ] 6.5  cm-watchdog
         exe:    $VenvPython
         args:   watchdog_cm.py
         dir:    $InstallEmb\
         env:    (нет)
         stdout: $InstallLogs\cm-watchdog.log
         stderr: $InstallLogs\cm-watchdog-err.log
         depend: cm-api
```

**Установка DependOnService (nssm не имеет прямой команды — через реестр):**
```powershell
foreach ($pair in @(
    @{ svc = "cm-embed";    deps = @("cm-qdrant") },
    @{ svc = "cm-api";      deps = @("cm-qdrant", "cm-embed") },
    @{ svc = "cm-mcp";      deps = @("cm-api") },
    @{ svc = "cm-watchdog"; deps = @("cm-api") }
)) {
    $key = "HKLM:\SYSTEM\CurrentControlSet\Services\$($pair.svc)"
    Set-ItemProperty -Path $key -Name "DependOnService" -Value $pair.deps -Type MultiString
}
```

**nssm параметры (все сервисы):**
```
AppRotateFiles    1
AppRotateSeconds  86400     (ротация каждые сутки)
AppRotateBytes    10485760  (10 MB max per log)
Start             SERVICE_AUTO_START
ObjectName        LocalSystem   (запускать как SYSTEM — доступ к ProgramFiles/ProgramData)
```

---

### Шаг 7 — Запуск сервисов и smoke test

Порядок запуска с ожиданием готовности (TCP connect loop, не Start-Sleep):

```
[ ] 7.1  nssm start cm-qdrant → Wait-TcpPort 6333 (max 30s)
         HEALTH: GET http://127.0.0.1:6333/health → {"status":"ok"}

[ ] 7.2  nssm start cm-embed  → Wait-TcpPort 8080 (max 90s — загрузка ONNX)
         HEALTH: GET http://127.0.0.1:8080/health → {"status":"ok"}
         TEST:   POST /embed {"inputs":"test"} → dim=384

[ ] 7.3  nssm start cm-api    → Wait-TcpPort 3847 (max 30s)
         HEALTH: GET http://127.0.0.1:3847/health → "healthy" | "degraded"
         ACCEPT: "degraded" если Qdrant ещё не синхронизировался

[ ] 7.4  nssm start cm-mcp    → Wait-TcpPort 8770 (max 15s)

[ ] 7.5  nssm start cm-watchdog (без health check — daemon)
```

**TCP wait loop (не Start-Sleep с фиксированным временем):**
```powershell
function Wait-TcpPort {
    param([int]$Port, [int]$TimeoutSec = 30)
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        try {
            $tcp = [System.Net.Sockets.TcpClient]::new()
            $tcp.Connect("127.0.0.1", $Port)
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
[ ] 8.1  $InstallBin\cm-off.bat
[ ] 8.2  $InstallBin\cm-restart.bat
```

Оба файла:
- Проверяют права администратора через `net session`
- Если нет прав — поднимают UAC через `powershell -Command "Start-Process ..."`
- Используют `timeout /t 2 /nobreak >nul` вместо `pause` — окно автоматически закрывается

---

### Шаг 9 — Финальный вывод

```
[ ] 9.1  Записать op=complete в install.json
[ ] 9.2  Вывести итоговую таблицу (порты, пути, команды)
[ ] 9.3  Сводка предупреждений (если были WARN на шагах)
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
  %ProgramData%\context-manager\postgres_credentials.txt

Logs:
  %ProgramData%\context-manager\logs\

Manage:
  %ProgramFiles%\context-manager\cm-restart.bat
  %ProgramFiles%\context-manager\cm-off.bat

Uninstall:
  powershell -File "%ProgramFiles%\context-manager\scripts\uninstall-native.ps1"
```

---

## Воркфлоу анинсталлера (на основе install.json)

Анинсталлер читает `install.json` в обратном порядке массива.
Если `install.json` поврежден → fallback: хардкоженный список известных сервисов и папок.

### Операции в обратном порядке

| op | Действие анинсталлера |
|----|----------------------|
| `complete` | пропустить |
| `mcp_json` | сделать резервную копию → удалить файл |
| `nssm_install` | `nssm stop <service>` → `nssm remove <service> confirm` |
| `pip_install` | пропустить (venv удалится целиком на шаге venv_create) |
| `venv_create` | `Remove-Item -Recurse $InstallEmb\.venv` |
| `model_download` | `Remove-Item -Recurse <dst>` (спросить пользователя) |
| `file_download` | `Remove-Item <dst>` |
| `file_copy` | `Remove-Item <dst>` |
| `npm_install` | `Remove-Item -Recurse $InstallApp\node_modules` + `$InstallApp\dist` |
| `dir_create` | `Remove-Item <path>` если пустая |

### Чеклист анинсталлера

```
[ ] A.1  Проверка прав администратора (как в инсталляторе)
[ ] A.2  Прочитать install.json → если поврежден: fallback на список сервисов
[ ] A.3  Остановить и удалить nssm сервисы:
         порядок: cm-watchdog → cm-mcp → cm-api → cm-embed → cm-qdrant
[ ] A.4  Убрать DependOnService записи из реестра
[ ] A.5  Спросить: удалить модель? (38+ MB, долго качается)
[ ] A.6  Спросить: удалить базу данных context_db? (psql DROP DATABASE + PGPASSWORD)
[ ] A.7  Удалить файлы по манифесту (file_copy, file_download, mcp_json)
[ ] A.8  Восстановить резервную копию claude_desktop_config.json (если была)
[ ] A.9  Удалить директории по манифесту в обратном порядке
[ ] A.10 Вывод: что удалено, что оставлено
```

**Лог анинсталлера:** `$InstallData\uninstall.log`
Пишется ДО удаления директорий — последнее действие удаляет `$InstallData` и `$InstallBin`.

---

## Шпаргалка: правила Windows Native

| Что | Правило |
|-----|---------|
| Бинарники/код | `$env:ProgramFiles\context-manager` |
| Данные/конфиги/логи | `$env:ProgramData\context-manager` |
| MCP конфиг | `$env:APPDATA\Claude\claude_desktop_config.json` |
| Путь к node.exe | `(Get-Command node).Source` — никогда хардкод |
| Путь к python.exe | `$VenvPython` = `$InstallEmb\.venv\Scripts\python.exe` |
| Путь к psql.exe | `(Get-Command psql).Source` |
| Права админа | `[Security.Principal.WindowsPrincipal]` — в начале скрипта |
| Кодировка лога | UTF-8 with BOM |
| Слеши в путях | `Join-Path` или `[IO.Path]::Combine` — никогда конкатенация строк |
| HTTP-запросы | `Invoke-WebRequest -UseBasicParsing` (без IE engine) |
| Распаковка ZIP | `Shell.Application.CopyHere` — быстрее `Expand-Archive` |
| Ожидание порта | `Wait-TcpPort` (TCP connect loop) — не `Start-Sleep` |
| Переменные NSSM | Все переменные одним вызовом `AppEnvironmentExtra` |
| .env для Node.js | Node читает `.env` сам — не прошивать в NSSM реестр |
| createdb/psql | `$env:PGPASSWORD` перед вызовом — не интерактивный ввод |
| Копирование файлов | `robocopy /E /XD /XF` — не `Copy-Item -Recurse -Exclude` |
| Порядок запуска | `DependOnService` в реестре — не ручной порядок старта |
| Сервисный аккаунт | `ObjectName LocalSystem` — доступ к ProgramFiles/ProgramData |
