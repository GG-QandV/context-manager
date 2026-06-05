# Context Manager Installer (Windows PowerShell)
param(
    [switch]$Docker
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

Write-Host "=== Context Manager Installer ===" -ForegroundColor Cyan

# --- Dependency check ---
Write-Host "`nChecking dependencies..." -ForegroundColor Yellow

try {
    $nodeVer = node --version
    Write-Host "  node $nodeVer ✓" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found. Install Node.js >= 18 from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

$verParts = $nodeVer -replace 'v', '' -split '\.'
if ([int]$verParts[0] -lt 18) {
    Write-Host "ERROR: Node.js >= 18 required, found $nodeVer" -ForegroundColor Red
    exit 1
}

try {
    $npmVer = npm --version
    Write-Host "  npm $npmVer ✓" -ForegroundColor Green
} catch {
    Write-Host "ERROR: npm not found." -ForegroundColor Red
    exit 1
}

# --- npm install ---
Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow
Set-Location $ProjectDir
npm install

# --- Build ---
Write-Host "`nBuilding TypeScript..." -ForegroundColor Yellow
npm run build

# --- Create config dir ---
Write-Host "`nCreating config directory..." -ForegroundColor Yellow
$configDir = node -e "const { getConfigDir } = require('./dist/config/paths'); console.log(getConfigDir());"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
Write-Host "  $configDir" -ForegroundColor Green

# --- Init MCP config ---
Write-Host "`nInitializing MCP configuration..." -ForegroundColor Yellow
node "$ProjectDir/scripts/init-mcp-config.mjs"

# --- Docker ---
if ($Docker) {
    Write-Host "`nStarting Docker Compose..." -ForegroundColor Yellow
    docker compose up -d
}

# --- Summary ---
Write-Host "`n=== Install complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Config directory: $(node -e "const { getConfigDir } = require('./dist/config/paths'); console.log(getConfigDir());")"
Write-Host ""
Write-Host "To start:"
Write-Host "  npm start"
Write-Host ""
Write-Host "MCP config generated at: mcp.json"
