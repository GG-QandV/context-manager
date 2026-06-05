# =============================================================================
# change-pg-password.ps1
# Context Manager — скрипт смены пароля PostgreSQL
#
# Запускать от Администратора.
# Скрипт:
#   1. Запрашивает новый пароль
#   2. Применяет его в PostgreSQL (ALTER USER)
#   3. Обновляет .env файл
#   4. Перезапускает сервис cm-api
# =============================================================================

#Requires -RunAsAdministrator

$ErrorActionPreference = "Continue"
$DataDir = Join-Path $env:ProgramData "Context Manager"
$EnvFile = Join-Path $DataDir "app\.env"

# --- Проверяем что .env существует ------------------------------------------
if (-not (Test-Path $EnvFile)) {
    Write-Host "ОШИБКА: файл .env не найден: $EnvFile" -ForegroundColor Red
    Write-Host "Убедитесь что Context Manager установлен корректно." -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода"
    exit 1
}

# --- Получаем текущий пароль из .env ----------------------------------------
$envContent = Get-Content $EnvFile -Raw
$match = [regex]::Match($envContent, 'postgresql://postgres:([^@]+)@')
if (-not $match.Success) {
    Write-Host "ОШИБКА: не удалось найти DATABASE_URL в .env" -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода"
    exit 1
}
$currentPassword = $match.Groups[1].Value

Write-Host ""
Write-Host "=== Context Manager — Смена пароля PostgreSQL ===" -ForegroundColor Cyan
Write-Host ""

# --- Запрашиваем новый пароль -----------------------------------------------
$newPasswordSecure = Read-Host "Введите новый пароль" -AsSecureString
$confirmSecure     = Read-Host "Подтвердите пароль" -AsSecureString

$newPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPasswordSecure)
)
$confirm = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmSecure)
)

if ($newPassword -ne $confirm) {
    Write-Host "ОШИБКА: пароли не совпадают." -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода"
    exit 1
}

if ($newPassword.Length -lt 8) {
    Write-Host "ОШИБКА: пароль должен быть не менее 8 символов." -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода"
    exit 1
}

# --- Применяем пароль в PostgreSQL ------------------------------------------
Write-Host ""
Write-Host "Применяем новый пароль в PostgreSQL..." -ForegroundColor Yellow

$env:PGPASSWORD = $currentPassword
$pgResult = & psql -U postgres -h 127.0.0.1 -p 5432 `
    -c "ALTER USER postgres WITH PASSWORD '$newPassword';" 2>&1
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА при изменении пароля в PostgreSQL:" -ForegroundColor Red
    Write-Host $pgResult -ForegroundColor Red
    Write-Host ""
    Write-Host "Возможные причины:" -ForegroundColor Yellow
    Write-Host "  - PostgreSQL не запущен (проверьте services.msc)" -ForegroundColor Yellow
    Write-Host "  - Текущий пароль в .env не совпадает с реальным паролем PG" -ForegroundColor Yellow
    Read-Host "Нажмите Enter для выхода"
    exit 1
}

Write-Host "✓ Пароль в PostgreSQL изменён." -ForegroundColor Green

# --- Обновляем .env файл ----------------------------------------------------
Write-Host "Обновляем .env файл..." -ForegroundColor Yellow

$newEnvContent = $envContent -replace `
    '(postgresql://postgres:)[^@]+(@)', `
    "`${1}$newPassword`${2}"

Set-Content -Path $EnvFile -Value $newEnvContent -Encoding UTF8 -NoNewline

Write-Host "✓ .env файл обновлён." -ForegroundColor Green

# --- Обновляем postgres_credentials.txt -------------------------------------
$credsPath = Join-Path $DataDir "postgres_credentials.txt"
if (Test-Path $credsPath) {
    $credsContent = Get-Content $credsPath -Raw
    $credsContent = $credsContent -replace '( Password : ).*', "`${1}$newPassword"
    Set-Content -Path $credsPath -Value $credsContent -Encoding UTF8 -NoNewline
    Write-Host "✓ postgres_credentials.txt обновлён." -ForegroundColor Green
}

# --- Перезапускаем сервис cm-api -------------------------------------------
Write-Host "Перезапускаем cm-api..." -ForegroundColor Yellow

$nssmPath = Join-Path $env:ProgramFiles "Context Manager\bin\nssm.exe"
if (Test-Path $nssmPath) {
    & $nssmPath restart cm-api | Out-Null
    Start-Sleep -Seconds 3

    # Проверяем что сервис поднялся
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", 3847)
        $tcp.Close()
        Write-Host "✓ cm-api перезапущен и отвечает на порту 3847." -ForegroundColor Green
    } catch {
        Write-Host "ПРЕДУПРЕЖДЕНИЕ: cm-api не отвечает на порту 3847." -ForegroundColor Yellow
        Write-Host "Проверьте статус в services.msc или логи:" -ForegroundColor Yellow
        Write-Host "  $DataDir\logs\cm-api.log" -ForegroundColor Yellow
    }
} else {
    Write-Host "ПРЕДУПРЕЖДЕНИЕ: nssm.exe не найден, перезапустите cm-api вручную." -ForegroundColor Yellow
}

# --- Финальный вывод --------------------------------------------------------
Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " Пароль успешно изменён!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Новые данные для подключения:" -ForegroundColor White
Write-Host "   Host     : 127.0.0.1:5432" -ForegroundColor White
Write-Host "   User     : postgres" -ForegroundColor White
Write-Host "   Password : $newPassword" -ForegroundColor White
Write-Host "   Database : context_db" -ForegroundColor White
Write-Host ""

Read-Host "Нажмите Enter для закрытия"
