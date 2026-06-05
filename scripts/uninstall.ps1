# Context Manager Uninstaller (Windows PowerShell)
param()

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

Write-Host "=== Context Manager Uninstaller ===" -ForegroundColor Cyan

# --- Stop if running ---
Write-Host "`nStopping server..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "dist/index.js"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# --- Ask about config (BEFORE removing dist/, so require() works) ---
$configDir = node -e "const { getConfigDir } = require('$ProjectDir/dist/config/paths'); console.log(getConfigDir());" 2>$null

# --- Remove build artifacts ---
Write-Host "Removing build artifacts..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$ProjectDir/dist" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$ProjectDir/node_modules" -ErrorAction SilentlyContinue
if ($configDir -and (Test-Path $configDir)) {
    Write-Host "`nConfig directory: $configDir" -ForegroundColor Yellow
    $confirm = Read-Host "Remove config directory? (y/N)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Remove-Item -Recurse -Force $configDir
        Write-Host "Config removed." -ForegroundColor Green
    } else {
        Write-Host "Config kept at $configDir" -ForegroundColor Gray
    }
}

# --- Ask about generated mcp.json ---
if (Test-Path "$ProjectDir/mcp.json") {
    $confirm = Read-Host "`nRemove generated mcp.json? (y/N)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Remove-Item -Force "$ProjectDir/mcp.json"
        Write-Host "mcp.json removed." -ForegroundColor Green
    }
}

Write-Host "`n=== Uninstall complete ===" -ForegroundColor Cyan
Write-Host "To remove Docker containers: docker compose down -v"
