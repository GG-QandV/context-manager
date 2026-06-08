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
Write-Step "0. Project Setup (Cloning/Downloading)"
# If script is not run from the project folder (e.g. run via network Invoke-Expression)
if (-not (Test-Path "package.json")) {
    Write-Warn "Project files not found in the current directory."
    $targetDir = "C:\context-manager"
    
    if (-not $DryRun) {
        Write-Host "Downloading project from GitHub..."
        $repoZip = "$env:TEMP\context-manager-main.zip"
        
        try {
            Invoke-WebRequest -Uri $RepoZipUrl -OutFile $repoZip
            Write-Host "Extracting archive..."
            Expand-Archive -Path $repoZip -DestinationPath "C:\" -Force
            Remove-Item $repoZip
            
            # GitHub ZIP usually contains 'repo-name-main' folder
            $extractedFolder = Get-ChildItem "C:\" -Directory | Where-Object { $_.Name -match "context-manager.*" } | Select-Object -First 1
            if ($extractedFolder -and $extractedFolder.FullName -ne $targetDir) {
                if (Test-Path $targetDir) { Remove-Item -Recurse -Force $targetDir }
                Rename-Item $extractedFolder.FullName $targetDir
            }
        } catch {
            Write-Host "Failed to download the project automatically. Please run this script from the project directory." -ForegroundColor Red
            exit 1
        }
        
        Set-Location $targetDir
        Write-Host "Switched location to $targetDir" -ForegroundColor Green
    }
} else {
    Write-Host "Project found locally. Proceeding with installation..." -ForegroundColor Green
}


# -----------------------------------------------------------------------------
Write-Step "1. Installing Core Dependencies (winget)"
function Install-Dependency($name, $wingetId, $cmdToCheck) {
    $found = Get-Command $cmdToCheck -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Warn "$name not found. Launching winget for installation..."
        if (-not $DryRun) {
            winget install --id $wingetId --accept-package-agreements --accept-source-agreements
            # Update PATH for the current session
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        }
    } else {
        Write-Host "$name already installed: $($found.Source)" -ForegroundColor Green
    }
}

Install-Dependency "Node.js" "OpenJS.NodeJS.LTS" "node"
Install-Dependency "Python" "Python.Python.3.12" "python"
Install-Dependency "NSSM" "nssm" "nssm"


# -----------------------------------------------------------------------------
Write-Step "2. Silent Installation of PostgreSQL"
$psqlFound = Get-Command "psql" -ErrorAction SilentlyContinue

# Function to generate a random safe database password
function Get-RandomPassword {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    $pass = ""
    1..16 | ForEach-Object { $pass += $chars[(Get-Random -Maximum $chars.Length)] }
    return $pass
}

$pgPassword = ""

if (-not $psqlFound) {
    Write-Host "PostgreSQL not found. Performing silent installation (Unattended Mode)..." -ForegroundColor Yellow
    if (-not $DryRun) {
        $pgPassword = Get-RandomPassword
        Write-Host "Generated a secure database password." -ForegroundColor Cyan
        
        # Run EDB Installer completely in background passing the superuser password
        $overrideArgs = "--mode unattended --unattendedmodeui none --superpassword ""$pgPassword"" --serverport 5432"
        winget install --id PostgreSQL.PostgreSQL --silent --accept-package-agreements --accept-source-agreements --override $overrideArgs
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Host "PostgreSQL installed successfully." -ForegroundColor Green
        
        # Save credentials and change password instructions in a separate file
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
        Write-Host "Credentials saved to $credsFile" -ForegroundColor Cyan
    }
} else {
    Write-Host "PostgreSQL already installed." -ForegroundColor Green
    # If PG is already installed, we cannot generate password, we will prompt if .env doesn't exist
}


# -----------------------------------------------------------------------------
Write-Step "3. Downloading Qdrant (Vector DB)"
if (-not (Test-Path "C:\qdrant\qdrant.exe")) {
    Write-Host "Downloading Qdrant..." -ForegroundColor Yellow
    if (-not $DryRun) {
        New-Item -ItemType Directory -Force -Path "C:\qdrant" | Out-Null
        $qdrantUrl = "https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-pc-windows-msvc.zip"
        $qdrantZip = "$env:TEMP\qdrant.zip"
        Invoke-WebRequest -Uri $qdrantUrl -OutFile $qdrantZip
        Expand-Archive -Path $qdrantZip -DestinationPath "C:\qdrant" -Force
        Remove-Item $qdrantZip
        Write-Host "Qdrant successfully installed to C:\qdrant" -ForegroundColor Green
    }
} else {
    Write-Host "Qdrant already downloaded: C:\qdrant\qdrant.exe" -ForegroundColor Green
}


# Resolve paths after PATH updates
$pythonPath = (Get-Command "python" -ErrorAction SilentlyContinue).Source
$nodePath = (Get-Command "node" -ErrorAction SilentlyContinue).Source
if (-not $pythonPath) { $pythonPath = "python" }
if (-not $nodePath) { $nodePath = "node" }


# -----------------------------------------------------------------------------
Write-Step "4. Project Build (Node.js)"
if ($DryRun) {
    Write-Host "[DryRun] npm install && npm run build"
} else {
    Write-Host "Installing NPM packages..."
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed." -ForegroundColor Red; exit 1 }
    
    Write-Host "Compiling TypeScript..."
    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { Write-Host "npm run build failed." -ForegroundColor Red; exit 1 }
    
    if (-not (Test-Path "dist/index.js")) {
        Write-Host "ERROR: dist/index.js not created." -ForegroundColor Red
        exit 1
    }
    Write-Host "Build completed successfully." -ForegroundColor Green
}


# -----------------------------------------------------------------------------
Write-Step "5. Initializing MCP configuration"
if ($DryRun) {
    Write-Host "[DryRun] node scripts/init-mcp-config.mjs"
} else {
    & $nodePath scripts/init-mcp-config.mjs
    if ($LASTEXITCODE -ne 0) { Write-Host "init-mcp-config failed." -ForegroundColor Red; exit 1 }
}


# -----------------------------------------------------------------------------
Write-Step "6. Installing Python dependencies (for ONNX Embedder)"
if ($DryRun) {
    Write-Host "[DryRun] pip install -r embed/requirements.txt"
} else {
    & $pythonPath -m pip install -r embed/requirements.txt
    if ($LASTEXITCODE -ne 0) { Write-Host "pip install failed." -ForegroundColor Red; exit 1 }
}


# -----------------------------------------------------------------------------
Write-Step "7. Downloading ONNX embedding model"
$modelDir = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $modelDir | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\ProgramData\nssm\logs" | Out-Null
}

if ($DryRun) {
    Write-Host "[DryRun] scripts/download-model.ps1"
} else {
    Write-Host "Downloading model intfloat/multilingual-e5-small..." -ForegroundColor Cyan
    Write-Warn "No HuggingFace registration is required for this public model."
    
    $onnxFiles = Get-ChildItem $modelDir -Filter "*.onnx" -ErrorAction SilentlyContinue
    if ($onnxFiles.Count -gt 0) {
        Write-Host "Model already exists in $modelDir" -ForegroundColor Yellow
    } else {
        powershell -ExecutionPolicy Bypass -File scripts/download-model.ps1
        if ($LASTEXITCODE -ne 0) { Write-Host "Failed to download the model." -ForegroundColor Red; exit 1 }
    }
}


# -----------------------------------------------------------------------------
Write-Step "8. Setting up environment (.env)"
if ($DryRun) {
    Write-Host "[DryRun] Creating .env and setting up DATABASE_URL"
} else {
    if (-not (Test-Path ".env")) {
        if (-not (Test-Path ".env.windows")) {
            Write-Host "ERROR: .env.windows not found in the project." -ForegroundColor Red
            exit 1
        }
        
        # If we just installed PG ourselves, we have the password. Otherwise, ask.
        if ($pgPassword -eq "") {
            $pwd = Read-Host "PostgreSQL was already installed. Enter password for 'postgres' user" -AsSecureString
            $pgPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwd))
        }
        
        $envContent = Get-Content ".env.windows" -Raw
        $envContent = $envContent -replace "YOURPASSWORD", $pgPassword
        Set-Content -Path ".env" -Value $envContent
        Write-Host ".env file successfully created (password integrated)." -ForegroundColor Green
    } else {
        Write-Host ".env already exists, skipping creation." -ForegroundColor Yellow
    }
}


# -----------------------------------------------------------------------------
Write-Step "9. Registering Windows services (nssm)"
$services = @(
    @{ Name = "cm-qdrant"; Exe = "C:\qdrant\qdrant.exe"; Args = "--uri http://127.0.0.1:6333"; Dir = "C:\qdrant"; Env = @() },
    @{ Name = "cm-embed"; Exe = $pythonPath; Args = "-m uvicorn embed_server:app --host 127.0.0.1 --port 8080"; Dir = "C:\context-manager\embed"; Env = @("MODEL_DIR=C:\context-manager\models\multilingual-e5-small_Q8\onnx") },
    @{ Name = "cm-api"; Exe = $nodePath; Args = "dist\index.js"; Dir = "C:\context-manager"; Env = @("QDRANT_HOST=localhost", "QDRANT_PORT=6333", "TEI_HOST=http://127.0.0.1:8080", "EMBEDDING_PROVIDER=huggingface-tei", "EMBEDDING_DIMENSIONS=384", "PORT=3847", "HOST=127.0.0.1") },
    @{ Name = "cm-mcp"; Exe = $nodePath; Args = "cm_http_adapter.mjs"; Dir = "C:\context-manager\mcp"; Env = @("CM_API_BASE=http://127.0.0.1:3847/api/context", "CM_MCP_PORT=8770") },
    @{ Name = "cm-watchdog"; Exe = $pythonPath; Args = "watchdog_cm.py"; Dir = "C:\context-manager\embed"; Env = @() }
)

foreach ($svc in $services) {
    if ($DryRun) { Write-Host "[DryRun] Installing service: $($svc.Name)"; continue }
    
    nssm status $svc.Name 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$($svc.Name) already registered, skipping." -ForegroundColor Yellow
        continue
    }
    
    Write-Host "Installing service $($svc.Name)..."
    nssm install $svc.Name $svc.Exe | Out-Null
    if ($svc.Args) { nssm set $svc.Name AppParameters $svc.Args | Out-Null }
    nssm set $svc.Name AppDirectory $svc.Dir | Out-Null
    if ($svc.Env.Count -gt 0) { nssm set $svc.Name AppEnvironmentExtra $svc.Env | Out-Null }
    
    nssm set $svc.Name AppStdout "C:\ProgramData\nssm\logs\$($svc.Name).log" | Out-Null
    nssm set $svc.Name AppStderr "C:\ProgramData\nssm\logs\$($svc.Name)-err.log" | Out-Null
    nssm set $svc.Name Start SERVICE_AUTO_START | Out-Null
    Write-Host "Service $($svc.Name) successfully registered." -ForegroundColor Green
}


# -----------------------------------------------------------------------------
Write-Step "10. Starting services"
if ($DryRun) {
    Write-Host "[DryRun] nssm start <all_services>"
} else {
    foreach ($svc in $services) {
        Write-Host "Starting $($svc.Name)..."
        nssm start $svc.Name | Out-Null
    }
}


# -----------------------------------------------------------------------------
Write-Step "11. Checking ports (Smoke tests)"
$ports = @(
    @{ Port = 5432; Name = "PostgreSQL" },
    @{ Port = 6333; Name = "Qdrant" },
    @{ Port = 8080; Name = "ONNX Embedder" },
    @{ Port = 3847; Name = "Context Manager" },
    @{ Port = 8770; Name = "MCP Adapter" }
)

if (-not $DryRun) {
    Write-Host "Waiting 5 seconds for services to initialize..."
    Start-Sleep -Seconds 5
}

foreach ($p in $ports) {
    if ($DryRun) {
        Write-Host "[DryRun] Port test $($p.Port) ($($p.Name))"
        continue
    }
    
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", $p.Port)
        Write-Host "Port $($p.Port) ($($p.Name)): Working (OK)" -ForegroundColor Green
        $tcp.Close()
    } catch {
        Write-Host "Port $($p.Port) ($($p.Name)): ERROR (FAIL)" -ForegroundColor Red
    }
}

Write-Step "12. Creating BAT shortcuts"
if (-not $DryRun) {
    $batOff = "C:\context-manager\cm-off.bat"
    $batOffContent = @"
@echo off
:: Check Administrator privileges
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
:: Check Administrator privileges
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
    Write-Host "Created executable batch files: $batOff and $batRestart" -ForegroundColor Green
}

Write-Host "`nInstallation successfully completed! Context Manager is ready for use." -ForegroundColor Cyan
