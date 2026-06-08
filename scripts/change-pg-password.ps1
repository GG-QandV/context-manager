# =============================================================================
# change-pg-password.ps1
# Context Manager — PostgreSQL password change script
#
# Must be run as Administrator.
# This script:
#   1. Prompts for a new password
#   2. Applies it in PostgreSQL (ALTER USER)
#   3. Updates the .env file
#   4. Restarts the cm-api service
# =============================================================================

#Requires -RunAsAdministrator

$ErrorActionPreference = "Continue"
$DataDir = Join-Path $env:ProgramData "Context Manager"
$EnvFile = Join-Path $DataDir "app\.env"

# --- Check if .env exists ----------------------------------------------------
if (-not (Test-Path $EnvFile)) {
    Write-Host "ERROR: .env file not found: $EnvFile" -ForegroundColor Red
    Write-Host "Please make sure Context Manager is installed correctly." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# --- Extract current password from .env ---------------------------------------
$envContent = Get-Content $EnvFile -Raw
$match = [regex]::Match($envContent, 'postgresql://postgres:([^@]+)@')
if (-not $match.Success) {
    Write-Host "ERROR: Could not find DATABASE_URL in .env" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
$currentPassword = $match.Groups[1].Value

Write-Host ""
Write-Host "=== Context Manager — Change PostgreSQL Password ===" -ForegroundColor Cyan
Write-Host ""

# --- Prompt for new password --------------------------------------------------
$newPasswordSecure = Read-Host "Enter new password" -AsSecureString
$confirmSecure     = Read-Host "Confirm new password" -AsSecureString

$newPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPasswordSecure)
)
$confirm = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmSecure)
)

if ($newPassword -ne $confirm) {
    Write-Host "ERROR: Passwords do not match." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if ($newPassword.Length -lt 8) {
    Write-Host "ERROR: Password must be at least 8 characters long." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# --- Apply password in PostgreSQL ---------------------------------------------
Write-Host ""
Write-Host "Applying new password in PostgreSQL..." -ForegroundColor Yellow

$env:PGPASSWORD = $currentPassword
$pgResult = & psql -U postgres -h 127.0.0.1 -p 5432 `
    -c "ALTER USER postgres WITH PASSWORD '$newPassword';" 2>&1
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR changing password in PostgreSQL." -ForegroundColor Red
    Write-Host $pgResult -ForegroundColor Red
    Write-Host ""
    Write-Host "If PostgreSQL was pre-installed on this machine, its password might be different." -ForegroundColor Yellow
    $fallback = Read-Host "Do you want to configure Context Manager to use your existing PostgreSQL password without changing it? (y/n)"
    if ($fallback -eq "y" -or $fallback -eq "Y") {
        $existingSecure = Read-Host "Enter your existing PostgreSQL password" -AsSecureString
        $existingPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($existingSecure)
        )
        
        Write-Host "Testing connection with the provided password..." -ForegroundColor Yellow
        $env:PGPASSWORD = $existingPassword
        $testResult = & psql -U postgres -h 127.0.0.1 -p 5432 -c "SELECT 1;" 2>&1
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Connection successful. Setting new password to your existing password." -ForegroundColor Green
            $newPassword = $existingPassword
        } else {
            Write-Host "ERROR: Connection test failed with the provided password:" -ForegroundColor Red
            Write-Host $testResult -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
    } else {
        Write-Host "Possible reasons:" -ForegroundColor Yellow
        Write-Host "  - PostgreSQL is not running (check services.msc)" -ForegroundColor Yellow
        Write-Host "  - The current password in .env does not match the actual PG password" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "✓ Password successfully changed in PostgreSQL." -ForegroundColor Green
}

# --- Update .env file ---------------------------------------------------------
Write-Host "Updating .env file..." -ForegroundColor Yellow

$newEnvContent = $envContent -replace `
    '(postgresql://postgres:)[^@]+(@)', `
    "`${1}$newPassword`${2}"

Set-Content -Path $EnvFile -Value $newEnvContent -Encoding UTF8 -NoNewline

Write-Host "✓ .env file updated." -ForegroundColor Green

# --- Update postgres_credentials.txt ------------------------------------------
$credsPath = Join-Path $DataDir "postgres_credentials.txt"
if (Test-Path $credsPath) {
    $credsContent = Get-Content $credsPath -Raw
    $credsContent = $credsContent -replace '( Password : ).*', "`${1}$newPassword"
    Set-Content -Path $credsPath -Value $credsContent -Encoding UTF8 -NoNewline
    Write-Host "✓ postgres_credentials.txt updated." -ForegroundColor Green
}

# --- Restart cm-api service --------------------------------------------------
Write-Host "Restarting cm-api..." -ForegroundColor Yellow

# Update registry AppEnvironmentExtra for cm-api to set the new database password
try {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\cm-api\Parameters"
    if (Test-Path $regPath) {
        $envExtra = Get-ItemProperty -Path $regPath -Name "AppEnvironmentExtra" -ErrorAction Stop
        $newEnvExtra = @()
        foreach ($line in $envExtra.AppEnvironmentExtra) {
            if ($line -match "^DATABASE_URL=") {
                $newEnvExtra += "DATABASE_URL=postgresql://postgres:$newPassword@127.0.0.1:5432/context_db"
            } else {
                $newEnvExtra += $line
            }
        }
        Set-ItemProperty -Path $regPath -Name "AppEnvironmentExtra" -Value $newEnvExtra -Type MultiString -ErrorAction Stop
        Write-Host "✓ Registry service environment updated." -ForegroundColor Green
    }
} catch {
    Write-Host "WARNING: Failed to update service registry environment: $_" -ForegroundColor Yellow
}

$nssmPath = Join-Path $env:ProgramFiles "Context Manager\bin\nssm.exe"
if (Test-Path $nssmPath) {
    & $nssmPath restart cm-api | Out-Null
    Start-Sleep -Seconds 3

    # Check if the service is up
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect("127.0.0.1", 3847)
        $tcp.Close()
        Write-Host "✓ cm-api restarted and responding on port 3847." -ForegroundColor Green
    } catch {
        Write-Host "WARNING: cm-api is not responding on port 3847." -ForegroundColor Yellow
        Write-Host "Please check status in services.msc or logs:" -ForegroundColor Yellow
        Write-Host "  $DataDir\logs\cm-api.log" -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: nssm.exe not found, please restart cm-api manually." -ForegroundColor Yellow
}

# --- Final Output -------------------------------------------------------------
Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " Password successfully changed!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " New connection details:" -ForegroundColor White
Write-Host "   Host     : 127.0.0.1:5432" -ForegroundColor White
Write-Host "   User     : postgres" -ForegroundColor White
Write-Host "   Password : $newPassword" -ForegroundColor White
Write-Host "   Database : context_db" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to close"
