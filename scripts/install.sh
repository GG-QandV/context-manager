#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Context Manager Installer ==="

# --- Dependency check ---
echo "Checking dependencies..."

command -v node >/dev/null 2>&1 || {
  echo "ERROR: Node.js not found. Install Node.js >= 18."
  echo "  https://nodejs.org/"
  exit 1
}

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "ERROR: Node.js >= 18 required, found $(node -v)"
  exit 1
fi
echo "  node $(node -v) ✓"

command -v npm >/dev/null 2>&1 || {
  echo "ERROR: npm not found."
  exit 1
}
echo "  npm $(npm -v) ✓"

# --- npm install ---
echo ""
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm install

# --- Build ---
echo ""
echo "Building TypeScript..."
npm run build

# --- Create config dir ---
echo ""
echo "Creating config directory..."
node -e "
const { getConfigDir } = require('./dist/config/paths');
const { mkdirSync } = require('fs');
mkdirSync(getConfigDir(), { recursive: true });
console.log('  ' + getConfigDir());
"

# --- Init MCP config ---
echo ""
echo "Initializing MCP configuration..."
node "$SCRIPT_DIR/init-mcp-config.mjs"

# --- Summary ---
echo ""
echo "=== Install complete ==="
echo ""
echo "Config directory: $(node -e "const { getConfigDir } = require('./dist/config/paths'); console.log(getConfigDir());")"
echo ""
echo "To start:"
echo "  npm start             # standalone"
echo "  docker compose up -d  # Docker"
echo ""
echo "Or copy MCP config to your IDE:"
echo "  cp mcp.json .vscode/mcp.json"
