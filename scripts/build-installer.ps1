# =============================================================================
# build-installer.ps1
# Context Manager — скрипт подготовки окружения и сборки установщика на Windows
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Начинаем сборку установщика Context Manager " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Создаем папку bin, если её нет
if (-not (Test-Path "bin")) {
    New-Item -ItemType Directory -Force -Path "bin" | Out-Null
    Write-Host "[*] Создана директория bin/" -ForegroundColor Gray
}

# 2. Скачивание Qdrant для Windows (если нет в bin)
$qdrantExe = "bin\qdrant.exe"
if (-not (Test-Path $qdrantExe)) {
    Write-Host "[*] Qdrant не найден. Скачиваем Qdrant v1.13.1..." -ForegroundColor Yellow
    $qdrantVersion = "v1.13.1"
    $qdrantUrl = "https://github.com/qdrant/qdrant/releases/download/$qdrantVersion/qdrant-x86_64-pc-windows-msvc.zip"
    $zipPath = "$env:TEMP\qdrant.zip"

    Invoke-WebRequest -Uri $qdrantUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "[*] Распаковка Qdrant..." -ForegroundColor Gray
    
    $shell = New-Object -ComObject Shell.Application
    $zip   = $shell.NameSpace($zipPath)
    $dest  = $shell.NameSpace("$PWD\bin")
    $dest.CopyHere($zip.Items(), 0x14)
    
    Remove-Item $zipPath -Force
    Write-Host "[+] Qdrant успешно скачан и распакован в bin/qdrant.exe" -ForegroundColor Green
} else {
    Write-Host "[+] Qdrant уже присутствует в bin/qdrant.exe" -ForegroundColor Green
}

# 3. Скачивание NSSM (если нет в bin)
$nssmExePath = "bin\nssm.exe"
if (-not (Test-Path $nssmExePath)) {
    Write-Host "[*] NSSM не найден. Скачиваем NSSM 2.24..." -ForegroundColor Yellow
    $nssmUrl  = "https://nssm.cc/release/nssm-2.24.zip"
    $zipPath  = "$env:TEMP\nssm.zip"

    Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "[*] Распаковка NSSM..." -ForegroundColor Gray
    
    $extractPath = "$env:TEMP\nssm-extract"
    if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

    $nssmExe = Get-ChildItem $extractPath -Recurse -Filter "nssm.exe" |
               Where-Object { $_.FullName -match "win64" } |
               Select-Object -First 1
               
    Copy-Item $nssmExe.FullName "bin\nssm.exe" -Force
    
    Remove-Item $zipPath -Force
    Remove-Item $extractPath -Recurse -Force
    Write-Host "[+] NSSM успешно скачан и распакован в bin/nssm.exe" -ForegroundColor Green
} else {
    Write-Host "[+] NSSM уже присутствует в bin/nssm.exe" -ForegroundColor Green
}

# 4. Сборка Node.js проекта
Write-Host "[*] Сборка Node.js проекта (npm install + build)..." -ForegroundColor Yellow
npm install
npm run build
Write-Host "[+] Сборка Node.js проекта завершена!" -ForegroundColor Green

# 5. Сборка установщика с помощью Inno Setup
Write-Host "[*] Ищем Inno Setup Compiler..." -ForegroundColor Yellow
$iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
    $iscc = Find-CommandPath "iscc" ""
}

if (-not $iscc -or -not (Test-Path $iscc)) {
    Write-Host "[-] Ошибка: Inno Setup 6 не найден на этой машине!" -ForegroundColor Red
    Write-Host "Скачайте и установите Inno Setup 6 с https://jrsoftware.org/isinfo.php" -ForegroundColor Yellow
    Exit 1
}

Write-Host "[*] Запускаем компиляцию установщика..." -ForegroundColor Yellow
& $iscc "context-manager-setup.iss"

if ($LASTEXITCODE -eq 0) {
    $outExe = Get-Item installer\*.exe | Select-Object -First 1
    Write-Host "=======================================================" -ForegroundColor Green
    Write-Host "[+] Успех! Установщик собран:" -ForegroundColor Green
    Write-Host "    $($outExe.FullName)" -ForegroundColor Green
    Write-Host "=======================================================" -ForegroundColor Green
} else {
    Write-Host "[-] Ошибка сборки установщика!" -ForegroundColor Red
    Exit 1
}
