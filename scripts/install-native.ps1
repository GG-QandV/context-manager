param(
    [switch]$DryRun,
    [string]$RepoZipUrl = "https://github.com/GG-QandV/context-manager/archive/refs/heads/master.zip"
)

$ErrorActionPreference = "Stop"

function Write-Step($text) {
    Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Write-Warn($text) {
    Write-Host "WARNING: $text" -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
Write-Step "0. Подготовка проекта (Клонирование/Загрузка)"
# Если скрипт запущен не из папки проекта (например, через Invoke-Expression из сети)
if (-not (Test-Path "package.json")) {
    Write-Warn "Файлы проекта не найдены в текущей директории."
    $targetDir = "C:\context-manager"
    
    if (-not $DryRun) {
        Write-Host "Скачиваем проект с GitHub..."
        $repoZip = "$env:TEMP\context-manager-main.zip"
        
        try {
            Invoke-WebRequest -Uri $RepoZipUrl -OutFile $repoZip
            Write-Host "Распаковка архива..."
            Expand-Archive -Path $repoZip -DestinationPath "C:\" -Force
            Remove-Item $repoZip
            
            # GitHub ZIP обычно содержит папку 'название_репо-main'
            $extractedFolder = Get-ChildItem "C:\" -Directory | Where-Object { $_.Name -match "context-manager.*" } | Select-Object -First 1
            if ($extractedFolder -and $extractedFolder.FullName -ne $targetDir) {
                if (Test-Path $targetDir) { Remove-Item -Recurse -Force $targetDir }
                Rename-Item $extractedFolder.FullName $targetDir
            }
        } catch {
            Write-Host "Не удалось автоматически скачать проект. Запустите скрипт из папки проекта." -ForegroundColor Red
            exit 1
        }
        
        Set-Location $targetDir
        Write-Host "Перешли в $targetDir" -ForegroundColor Green
    }
} else {
    Write-Host "Проект найден локально. Продолжаем установку..." -ForegroundColor Green
}


# -----------------------------------------------------------------------------
Write-Step "1. Установка базовых зависимостей (winget)"
function Install-Dependency($name, $wingetId, $cmdToCheck) {
    $found = Get-Command $cmdToCheck -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Warn "$name не найден. Запускаю winget для установки..."
        if (-not $DryRun) {
            winget install --id $wingetId --accept-package-agreements --accept-source-agreements
            # Обновляем PATH в текущей сессии
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        }
    } else {
        Write-Host "$name уже установлен: $($found.Source)" -ForegroundColor Green
    }
}

Install-Dependency "Node.js" "OpenJS.NodeJS.LTS" "node"
Install-Dependency "Python" "Python.Python.3.12" "python"
Install-Dependency "NSSM" "nssm" "nssm"


# -----------------------------------------------------------------------------
Write-Step "2. Тихая установка PostgreSQL"
$psqlFound = Get-Command "psql" -ErrorAction SilentlyContinue

# Функция для генерации случайного безопасного пароля
function Get-RandomPassword {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    $pass = ""
    1..16 | ForEach-Object { $pass += $chars[(Get-Random -Maximum $chars.Length)] }
    return $pass
}

$pgPassword = ""

if (-not $psqlFound) {
    Write-Host "PostgreSQL не найден. Выполняю тихую установку (Unattended Mode)..." -ForegroundColor Yellow
    if (-not $DryRun) {
        $pgPassword = Get-RandomPassword
        Write-Host "Сгенерирован безопасный пароль для БД." -ForegroundColor Cyan
        
        # Запускаем EDB Installer полностью в фоне с передачей пароля
        $overrideArgs = "--mode unattended --unattendedmodeui none --superpassword ""$pgPassword"" --serverport 5432"
        winget install --id PostgreSQL.PostgreSQL --silent --accept-package-agreements --accept-source-agreements --override $overrideArgs
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Host "PostgreSQL установлен успешно." -ForegroundColor Green
        
        # Сохраняем пароль и инструкцию по смене в отдельный файл
        $credsFile = "C:\context-manager\postgres_credentials.txt"
        $credsContent = @"
Auto-generated password for PostgreSQL (user: postgres):
$pgPassword

=======================================================
HOW TO CHANGE THE PASSWORD TO YOUR OWN
=======================================================
If you want to set your own custom password, copy and run this entire block in PowerShell as Administrator:

`$newPassword = "YOUR_NEW_PASSWORD"

# 1. Change password in PostgreSQL
& psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '`$newPassword';"

# 2. Automatically update the .env file
`$envFile = "C:\context-manager\.env"
`$envContent = Get-Content `$envFile -Raw
`$envContent = `$envContent -replace "(?<=postgresql://postgres:)[^@]+(?=@localhost:5432/context_db)", `$newPassword
Set-Content -Path `$envFile -Value `$envContent

# 3. Restart Context Manager service
nssm restart cm-api

Write-Host "Password successfully changed and service restarted." -ForegroundColor Green
"@
        Set-Content -Path $credsFile -Value $credsContent
        Write-Host "Пароль сохранен в $credsFile" -ForegroundColor Cyan
    }
} else {
    Write-Host "PostgreSQL уже установлен." -ForegroundColor Green
    # Если PostgreSQL уже был, пароль мы сгенерировать не можем, придётся спросить, но только если .env ещё нет
}


# -----------------------------------------------------------------------------
Write-Step "3. Загрузка Qdrant (Векторная БД)"
if (-not (Test-Path "C:\qdrant\qdrant.exe")) {
    Write-Host "Скачиваем Qdrant..." -ForegroundColor Yellow
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path "C:\qdrant" | Out-Null
        $qdrantUrl = "https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-pc-windows-msvc.zip"
        $qdrantZip = "$env:TEMP\qdrant.zip"
        Invoke-WebRequest -Uri $qdrantUrl -OutFile $qdrantZip
        Expand-Archive -Path $qdrantZip -DestinationPath "C:\qdrant" -Force
        Remove-Item $qdrantZip
        Write-Host "Qdrant успешно установлен в C:\qdrant" -ForegroundColor Green
    }
} else {
    Write-Host "Qdrant уже скачан: C:\qdrant\qdrant.exe" -ForegroundColor Green
}


# Получаем пути после обновления PATH
$pythonPath = (Get-Command "python" -ErrorAction SilentlyContinue).Source
$nodePath = (Get-Command "node" -ErrorAction SilentlyContinue).Source
if (-not $pythonPath) { $pythonPath = "python" }
if (-not $nodePath) { $nodePath = "node" }


# -----------------------------------------------------------------------------
Write-Step "4. Сборка проекта (Node.js)"
if ($DryRun) {
    Write-Host "[DryRun] npm install && npm run build"
} else {
    Write-Host "Установка NPM пакетов..."
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed." -ForegroundColor Red; exit 1 }
    
    Write-Host "Компиляция TypeScript..."
    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { Write-Host "npm run build failed." -ForegroundColor Red; exit 1 }
    
    if (-not (Test-Path "dist/index.js")) {
        Write-Host "ERROR: dist/index.js не создан." -ForegroundColor Red
        exit 1
    }
    Write-Host "Сборка завершена успешно." -ForegroundColor Green
}


# -----------------------------------------------------------------------------
Write-Step "5. Инициализация MCP конфигурации"
if ($DryRun) {
    Write-Host "[DryRun] node scripts/init-mcp-config.mjs"
} else {
    & $nodePath scripts/init-mcp-config.mjs
    if ($LASTEXITCODE -ne 0) { Write-Host "init-mcp-config failed." -ForegroundColor Red; exit 1 }
}


# -----------------------------------------------------------------------------
Write-Step "6. Установка Python зависимостей (для ONNX Embedder)"
if ($DryRun) {
    Write-Host "[DryRun] pip install -r embed/requirements.txt"
} else {
    & $pythonPath -m pip install -r embed/requirements.txt
    if ($LASTEXITCODE -ne 0) { Write-Host "pip install failed." -ForegroundColor Red; exit 1 }
}


# -----------------------------------------------------------------------------
Write-Step "7. Загрузка ONNX модели эмбеддингов"
$modelDir = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $modelDir | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\ProgramData\nssm\logs" | Out-Null
}

if ($DryRun) {
    Write-Host "[DryRun] scripts/download-model.ps1"
} else {
    Write-Host "Загружаем модель intfloat/multilingual-e5-small..." -ForegroundColor Cyan
    Write-Warn "Регистрация на HuggingFace для этой публичной модели НЕ ТРЕБУЕТСЯ."
    
    $onnxFiles = Get-ChildItem $modelDir -Filter "*.onnx" -ErrorAction SilentlyContinue
    if ($onnxFiles.Count -gt 0) {
        Write-Host "Модель уже существует в $modelDir" -ForegroundColor Yellow
    } else {
        powershell -ExecutionPolicy Bypass -File scripts/download-model.ps1
        if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка загрузки модели." -ForegroundColor Red; exit 1 }
    }
}


# -----------------------------------------------------------------------------
Write-Step "8. Настройка окружения (.env)"
if ($DryRun) {
    Write-Host "[DryRun] Создание .env и настройка DATABASE_URL"
} else {
    if (-not (Test-Path ".env")) {
        if (-not (Test-Path ".env.windows")) {
            Write-Host "ОШИБКА: .env.windows не найден в проекте." -ForegroundColor Red
            exit 1
        }
        
        # Если мы сами только что поставили PG, у нас есть пароль. Если нет — просим ввести.
        if ($pgPassword -eq "") {
            $pwd = Read-Host "У вас уже был установлен PostgreSQL. Введите пароль пользователя 'postgres'" -AsSecureString
            $pgPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwd))
        }
        
        $envContent = Get-Content ".env.windows" -Raw
        $envContent = $envContent -replace "YOURPASSWORD", $pgPassword
        Set-Content -Path ".env" -Value $envContent
        Write-Host "Файл .env успешно создан (пароль интегрирован)." -ForegroundColor Green
    } else {
        Write-Host ".env уже существует, пропускаем создание." -ForegroundColor Yellow
    }
}


# -----------------------------------------------------------------------------
Write-Step "9. Регистрация Windows служб (nssm)"
$services = @(
    @{ Name = "cm-qdrant"; Exe = "C:\qdrant\qdrant.exe"; Args = "--uri http://127.0.0.1:6333"; Dir = "C:\qdrant"; Env = @() },
    @{ Name = "cm-embed"; Exe = $pythonPath; Args = "-m uvicorn embed_server:app --host 127.0.0.1 --port 8080"; Dir = "C:\context-manager\embed"; Env = @("MODEL_DIR=C:\context-manager\models\multilingual-e5-small_Q8\onnx") },
    @{ Name = "cm-api"; Exe = $nodePath; Args = "dist\index.js"; Dir = "C:\context-manager"; Env = @("QDRANT_HOST=localhost", "QDRANT_PORT=6333", "TEI_HOST=http://127.0.0.1:8080", "EMBEDDING_PROVIDER=huggingface-tei", "EMBEDDING_DIMENSIONS=384", "PORT=3847", "HOST=127.0.0.1") },
    @{ Name = "cm-mcp"; Exe = $nodePath; Args = "cm_http_adapter.mjs"; Dir = "C:\context-manager\mcp"; Env = @("CM_API_BASE=http://127.0.0.1:3847/api/context", "CM_MCP_PORT=8770") },
    @{ Name = "cm-watchdog"; Exe = $pythonPath; Args = "watchdog_cm.py"; Dir = "C:\context-manager\embed"; Env = @() }
)

foreach ($svc in $services) {
    if ($DryRun) { Write-Host "[DryRun] Установка службы: $($svc.Name)"; continue }
    
    nssm status $svc.Name 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$($svc.Name) уже зарегистрирована, пропускаем." -ForegroundColor Yellow
        continue
    }
    
    Write-Host "Установка службы $($svc.Name)..."
    nssm install $svc.Name $svc.Exe | Out-Null
    if ($svc.Args) { nssm set $svc.Name AppParameters $svc.Args | Out-Null }
    nssm set $svc.Name AppDirectory $svc.Dir | Out-Null
    if ($svc.Env.Count -gt 0) { nssm set $svc.Name AppEnvironmentExtra $svc.Env | Out-Null }
    
    nssm set $svc.Name AppStdout "C:\ProgramData\nssm\logs\$($svc.Name).log" | Out-Null
    nssm set $svc.Name AppStderr "C:\ProgramData\nssm\logs\$($svc.Name)-err.log" | Out-Null
    nssm set $svc.Name Start SERVICE_AUTO_START | Out-Null
    Write-Host "Служба $($svc.Name) зарегистрирована." -ForegroundColor Green
}


# -----------------------------------------------------------------------------
Write-Step "10. Запуск служб"
if ($DryRun) {
    Write-Host "[DryRun] nssm start <all_services>"
} else {
    foreach ($svc in $services) {
        Write-Host "Запуск $($svc.Name)..."
        nssm start $svc.Name | Out-Null
    }
}


# -----------------------------------------------------------------------------
Write-Step "11. Проверка портов (Smoke tests)"
$ports = @(
    @{ Port = 5432; Name = "PostgreSQL" },
    @{ Port = 6333; Name = "Qdrant" },
    @{ Port = 8080; Name = "ONNX Embedder" },
    @{ Port = 3847; Name = "Context Manager" },
    @{ Port = 8770; Name = "MCP Adapter" }
)

if (-not $DryRun) {
    Write-Host "Ожидание 5 секунд для запуска служб..."
    Start-Sleep -Seconds 5
}

foreach ($p in $ports) {
    if ($DryRun) {
        Write-Host "[DryRun] Тест порта $($p.Port) ($($p.Name))"
        continue
    }
    
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", $p.Port)
        Write-Host "Порт $($p.Port) ($($p.Name)): Работает (OK)" -ForegroundColor Green
        $tcp.Close()
    } catch {
        Write-Host "Порт $($p.Port) ($($p.Name)): ОШИБКА (FAIL)" -ForegroundColor Red
    }
}

Write-Step "12. Создание кнопок-ярлыков (BAT-файлов)"
if (-not $DryRun) {
    $batOff = "C:\context-manager\cm-off.bat"
    $batOffContent = @"
@echo off
:: Проверка прав администратора
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Stopping Context Manager services...
    nssm stop cm-watchdog
    nssm stop cm-mcp
    nssm stop cm-api
    nssm stop cm-embed
    nssm stop cm-qdrant
    echo All services stopped. Closing in 2 seconds...
    timeout /t 2 /nobreak >nul
) else (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
)
"@
    Set-Content -Path $batOff -Value $batOffContent

    $batRestart = "C:\context-manager\cm-restart.bat"
    $batRestartContent = @"
@echo off
:: Проверка прав администратора
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Restarting Context Manager services...
    nssm restart cm-qdrant
    nssm restart cm-embed
    nssm restart cm-api
    nssm restart cm-mcp
    nssm restart cm-watchdog
    echo All services restarted. Closing in 2 seconds...
    timeout /t 2 /nobreak >nul
) else (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
)
"@
    Set-Content -Path $batRestart -Value $batRestartContent
    Write-Host "Созданы исполняемые файлы $batOff и $batRestart" -ForegroundColor Green
}

Write-Host "`nУстановка успешно завершена! Система Context Manager готова к работе." -ForegroundColor Cyan
