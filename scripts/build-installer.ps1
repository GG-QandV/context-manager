# =============================================================================
# build-installer.ps1
# Context Manager — Environment preparation and installer build script for Windows
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Starting Context Manager installer build              " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Create bin directory if it doesn't exist
if (-not (Test-Path "bin")) {
    New-Item -ItemType Directory -Force -Path "bin" | Out-Null
    Write-Host "[*] Created bin/ directory" -ForegroundColor Gray
}

# 2. Download Qdrant for Windows (if not in bin)
$qdrantExe = "bin\qdrant.exe"
if (-not (Test-Path $qdrantExe)) {
    Write-Host "[*] Qdrant not found. Downloading Qdrant v1.13.1..." -ForegroundColor Yellow
    $qdrantVersion = "v1.13.1"
    $qdrantUrl = "https://github.com/qdrant/qdrant/releases/download/$qdrantVersion/qdrant-x86_64-pc-windows-msvc.zip"
    $zipPath = "$env:TEMP\qdrant.zip"

    Invoke-WebRequest -Uri $qdrantUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "[*] Extracting Qdrant..." -ForegroundColor Gray
    
    $shell = New-Object -ComObject Shell.Application
    $zip   = $shell.NameSpace($zipPath)
    $dest  = $shell.NameSpace("$PWD\bin")
    $dest.CopyHere($zip.Items(), 0x14)
    
    Remove-Item $zipPath -Force
    Write-Host "[+] Qdrant downloaded and extracted to bin/qdrant.exe" -ForegroundColor Green
} else {
    Write-Host "[+] Qdrant already present in bin/qdrant.exe" -ForegroundColor Green
}

# 3. Download NSSM (if not in bin)
$nssmExePath = "bin\nssm.exe"
if (-not (Test-Path $nssmExePath)) {
    Write-Host "[*] NSSM not found. Downloading NSSM 2.24..." -ForegroundColor Yellow
    $nssmUrl  = "https://nssm.cc/release/nssm-2.24.zip"
    $zipPath  = "$env:TEMP\nssm.zip"

    Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "[*] Extracting NSSM..." -ForegroundColor Gray
    
    $extractPath = "$env:TEMP\nssm-extract"
    if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

    $nssmExe = Get-ChildItem $extractPath -Recurse -Filter "nssm.exe" |
               Where-Object { $_.FullName -match "win64" } |
               Select-Object -First 1
               
    Copy-Item $nssmExe.FullName "bin\nssm.exe" -Force
    
    Remove-Item $zipPath -Force
    Remove-Item $extractPath -Recurse -Force
    Write-Host "[+] NSSM downloaded and extracted to bin/nssm.exe" -ForegroundColor Green
} else {
    Write-Host "[+] NSSM already present in bin/nssm.exe" -ForegroundColor Green
}

# 4. Download Node.js for Windows (if not in bin)
$nodeExePath = "bin\node.exe"
if (-not (Test-Path $nodeExePath)) {
    Write-Host "[*] Node.js binary not found. Downloading Node.js v20.18.0..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v20.18.0/win-x64/node.exe"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeExePath -UseBasicParsing
    Write-Host "[+] Node.js binary saved to bin/node.exe" -ForegroundColor Green
} else {
    Write-Host "[+] Node.js binary already present in bin/node.exe" -ForegroundColor Green
}

# 5. Build Node.js project and bundle services
Write-Host "[*] Installing dependencies and bundling Node.js services..." -ForegroundColor Yellow
npm install
npm run bundle
Write-Host "[+] Bundling completed successfully!" -ForegroundColor Green

# 6. Build installer using Inno Setup
Write-Host "[*] Locating Inno Setup Compiler..." -ForegroundColor Yellow
$iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
    $iscc = (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
}

if (-not $iscc -or -not (Test-Path $iscc)) {
    Write-Host "[-] Error: Inno Setup 6 not found on this machine!" -ForegroundColor Red
    Write-Host "Please download and install Inno Setup 6 from https://jrsoftware.org/isinfo.php" -ForegroundColor Yellow
    Exit 1
}

Write-Host "[*] Running installer compilation..." -ForegroundColor Yellow
& $iscc "context-manager-setup.iss"

if ($LASTEXITCODE -eq 0) {
    $outExe = Get-Item installer\*.exe | Select-Object -First 1
    Write-Host "=======================================================" -ForegroundColor Green
    Write-Host "[+] Success! Installer built at:" -ForegroundColor Green
    Write-Host "    $($outExe.FullName)" -ForegroundColor Green
    Write-Host "=======================================================" -ForegroundColor Green
} else {
    Write-Host "[-] Error: Installer build failed!" -ForegroundColor Red
    Exit 1
}
