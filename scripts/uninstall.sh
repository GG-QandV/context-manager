#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Context Manager Uninstaller ==="

# --- Stop if running ---
if command -v npx &>/dev/null && [ -f "$PROJECT_DIR/package.json" ]; then
  echo "Stopping server..."
  # try graceful stop via node
  lsof -ti:3847 2>/dev/null | xargs kill 2>/dev/null || true
fi

# --- Ask about config (BEFORE removing dist/, so require() works) ---
CONFIG_DIR=$(node -e "const { getConfigDir } = require('$PROJECT_DIR/dist/config/paths'); console.log(getConfigDir());" 2>/dev/null || echo "")

# --- Remove build artifacts ---
echo "Removing build artifacts..."
rm -rf "$PROJECT_DIR/dist"
rm -rf "$PROJECT_DIR/node_modules"

if [ -n "$CONFIG_DIR" ] && [ -d "$CONFIG_DIR" ]; then
  echo ""
  echo "Config directory found at: $CONFIG_DIR"
  read -rp "Remove config directory? (y/N): " confirm
  if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    rm -rf "$CONFIG_DIR"
    echo "Config removed."
  else
    echo "Config kept at $CONFIG_DIR"
  fi
fi

# --- Ask about generated mcp.json ---
if [ -f "$PROJECT_DIR/mcp.json" ]; then
  echo ""
  read -rp "Remove generated mcp.json? (y/N): " confirm
  if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    rm -f "$PROJECT_DIR/mcp.json"
    echo "mcp.json removed."
  fi
fi

echo ""
echo "=== Uninstall complete ==="
echo "Node modules and build artifacts removed."
echo "To remove Docker containers: docker compose down -v"
