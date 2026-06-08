# Context Manager — Usage Guide for Beginners

**Last updated:** June 2026 | **Version:** 2.2.1

> This guide is written for people who are **not programmers**. If you can use email and browse the web, you can follow this guide. No coding knowledge required.

---

## Table of Contents

1. [What is Context Manager?](#what-is-context-manager)
2. [What you need before installing](#what-you-need-before-installing)
3. [Installing on Windows 10/11](#installing-on-windows-1011)
4. [Checking if it worked](#checking-if-it-worked)
5. [Connecting to Claude Desktop](#connecting-to-claude-desktop)
6. [Connecting to Cursor / VS Code](#connecting-to-cursor--vs-code)
7. [Using Context Manager daily](#using-context-manager-daily)
8. [System tray icon](#system-tray-icon)
9. [Tunnel management](#tunnel-management)
10. [Stopping and starting services](#stopping-and-starting-services)
11. [Finding help and logs](#finding-help-and-logs)
12. [FAQ](#faq)

---

## What is Context Manager?

Context Manager is a **memory bank for AI assistants** like Claude, ChatGPT, and others.

**The problem it solves:** When you talk to Claude today, it remembers this conversation. But tomorrow, it starts fresh — it forgets everything you discussed yesterday.

**What Context Manager does:** It saves your conversations, decisions, and important information. When you start a new chat, your AI assistant can look up what you discussed before.

**Think of it like this:** Context Manager is like a notebook that your AI assistant can read. You write in it (automatically), and your assistant reads it when you start a new conversation.

---

## What you need before installing

Before you install Context Manager, make sure you have:

1. **Windows 10 or Windows 11** (the installer won't work on older versions)
2. **An internet connection** (to download the installer)
3. **About 5 minutes** of your time
4. **Administrator access** on your computer (you'll need to click "Yes" when Windows asks for permission)

That's it! You don't need to install anything else first.

---

## Installing on Windows 10/11

### Step 1: Download the installer

1. Open your web browser and go to:
   [github.com/GG-QandV/context-manager/releases](https://github.com/GG-QandV/context-manager/releases)
2. Download the latest `context-manager-setup.exe`
3. Double-click the downloaded file
4. Click **Yes** if Windows asks "Do you want to allow this app to make changes?"

### Step 2: Follow the setup wizard

The installer will guide you through the setup. It will:
- Install PostgreSQL (database) — takes about 1 minute
- Install Qdrant (search engine) — takes about 30 seconds
- Install Context Manager services — takes about 2 minutes
- Download the AI model (multilingual-e5-small) — takes about 1 minute
- Start all services and show the tray icon — takes about 30 seconds

**Total time:** 5-10 minutes depending on your internet speed.

### Step 3: Finish

When the installer says "Setup Complete", everything is installed and running. You will see a colored circle icon in your system tray (bottom-right corner near the clock).

If you prefer to install via PowerShell, you can use the legacy script:
```powershell
irm https://raw.githubusercontent.com/GG-QandV/context-manager/master/scripts/install-native.ps1 | iex
```

---

## Checking if it worked

To check if Context Manager is running properly:

1. Open **any web browser** (Chrome, Firefox, Edge, etc.)
2. Type this in the address bar and press Enter:
   ```
   http://localhost:3847/health
   ```
3. You should see something like this:
   ```json
   {"status":"healthy","postgresql":"connected","qdrant":"connected"}
   ```

If you see `"status":"healthy"` — everything is working!

If you see an error or the page doesn't load:
- Wait 1 minute and try again (services may still be starting)
- See the [Troubleshooting section](#faq) below

---

## Connecting to Claude Desktop

### Step 1: Open PowerShell as Administrator

(Same as Step 1 in the install section above)

### Step 2: Run the config generator

Type the appropriate command and press Enter:

**If you used the .exe installer (recommended):**
```powershell
cd "C:\Program Files\Context Manager"
.\bin\node.exe scripts\init-mcp-config.mjs
```

**If you used the PowerShell script (`install-native.ps1`):**
```powershell
cd C:\context-manager
node scripts/init-mcp-config.mjs
```

You should see: "MCP config written to..." — this means it worked.

### Step 3: Restart Claude Desktop

1. Close Claude Desktop completely (right-click the icon in system tray → Quit)
2. Open Claude Desktop again

### Step 4: Test it

Start a new conversation in Claude and ask:
> "Can you check your memory using cm_stats?"

Claude should be able to see Context Manager and show you statistics about stored context.

---

## Connecting to Cursor / VS Code

### Step 1: Open the MCP config

1. Open File Explorer
2. Navigate to the install folder:
   - **.exe installer:** `C:\Program Files\Context Manager\app\`
   - **PowerShell script:** `C:\context-manager\`
3. Open the file `mcp.json` with Notepad

### Step 2: Copy the contents

Select all text (Ctrl+A) and copy it (Ctrl+C).

### Step 3: Add to your IDE

**For Cursor:**
1. Open Cursor
2. Press Ctrl+Shift+P
3. Type "MCP" and select "MCP: Open Configuration"
4. Paste the copied content and save

**For VS Code with Continue:**
1. Open VS Code
2. Press Ctrl+Shift+P
3. Type "Continue" and select "Continue: Open config.json"
4. Add the MCP server configuration from the copied content

---

## Using Context Manager daily

Once installed, you don't need to do anything special. Context Manager works in the background.

### What happens automatically

- When you talk to Claude (or other AI tools), important information is saved
- When you start a new conversation, your AI can look up what you discussed before
- Everything is stored locally on your computer — nothing goes to the cloud

### What you can do manually

If you want to check what's stored:

1. Open a browser
2. Go to `http://localhost:3847/health` — see if everything is running
3. Go to `http://localhost:3847/api/context/stats` — see how much context is stored

### Things you might want to know

- **Where is my data stored?** In PostgreSQL database (data is in `C:\ProgramData\Context Manager\` for .exe installer, or `C:\context-manager\data\` for PowerShell script install)
- **Can I backup my data?** Yes, you can export context via the API
- **How much space does it use?** Usually a few megabytes per conversation
- **Does it slow down my computer?** No, it uses very little memory when idle

---

## System tray icon

Context Manager adds a status indicator to your system tray (bottom-right corner of your screen near the clock). The indicator is a colored circle that shows the health of Context Manager at a glance.

### How the tray icon gets installed

- **On Windows:** The installer registers the tray icon as a service. It starts automatically when you log in.
- **On Linux:** The tray icon is launched when the Context Manager API starts. It appears as an AppIndicator in your desktop environment.
- **On macOS:** The tray icon uses the platform's native menu bar icon (requires PyQt6).

If the tray icon does not appear automatically, you can start it manually:

**If you used the .exe installer (recommended):**
```powershell
# Windows (PowerShell as Admin)
cd "C:\Program Files\Context Manager\embed\.venv\Scripts"
.\pythonw.exe -m cm_integration.tray_pyqt
```

**If you used the PowerShell script (`install-native.ps1`):**
```powershell
# Windows (PowerShell as Admin)
cd C:\context-manager
python -m cm_integration.tray_pyqt
```

**Linux / macOS:**
```bash
python -m cm_integration.tray_pyqt
```

### What the colors mean

The tray icon uses five colors to reflect the current health of the system:

| Color | State | Meaning | What to do |
|-------|-------|---------|------------|
| 🔵 **Blue** | Idle | All services healthy, no recent activity | Nothing — everything is fine |
| 🟢 **Green** | Active | AI model is processing (activity in last 5 seconds) | Let it finish — normal operation |
| 🩵 **Teal** | Connected | Recent API activity (5–30 seconds ago) | Normal state after heavy use |
| 🟡 **Yellow** | Warning | Node.js MCP adapter is offline (Fastify API still up) | Check `http://localhost:8770/health` |
| 🔴 **Red** | Error | Context Manager API is not responding | Restart services (see [Stopping and starting](#stopping-and-starting-services)) or check logs |

### How to use the tray icon

1. **Right-click** the colored circle in your system tray
2. A menu appears with the following options:

| Menu item | Icon | What it does |
|-----------|------|-------------|
| **Status** | ℹ️ `info-thin.svg` | Shows a popup with current system status |
| **Tunnel** | 🌐 `globe-simple-thin.svg` | Opens tunnel management submenu (see below) |
| **Quit** | ⏻ `power-thin.svg` | Closes the tray icon (services keep running) |

### Tunnel management

The tunnel allows external AI tools (Claude, Perplexity, ChatGPT, Grok) to securely connect to your Context Manager over the internet. It uses SSH tunneling (Serveo) to create a public URL that points to your local Context Manager.

#### Tunnel installation

The tunnel is built into Context Manager — no separate installation needed. However, the OAuth adapter (which manages authentication for external connections) runs as a separate background process. To install or verify the tunnel components:

**Windows (installed automatically):**
- `python -m cm_integration.tunnel_manager` is registered as a background process
- The tray icon starts and stops it through its menu

**Linux / macOS (first-time setup):**
```bash
# Ensure SSH is available (required for Serveo tunnel)
which ssh || sudo apt install openssh-client

# Start the tunnel adapter manually
python -m cm_integration.tunnel_manager
```

#### Using the tunnel from the tray icon

**Step 1 — Start the tunnel:**
1. Right-click the tray icon → **Tunnel** → ▶️ **Start Tunnel** (with `play-thin.svg` icon)
2. Wait a few seconds — the tray will show a notification "🌐 Tunnel Ready" with the tunnel URL
3. The tunnel status changes to **ACTIVE** with the URL shown in the tooltip

**Step 2 — Copy connection details for your AI tools:**
1. Right-click the tray icon → **Tunnel**
2. You will see a list of configured services (Perplexity, Claude, Grok, etc.), each with its own icon
3. Hover over a service → click **📋 Copy URL** (`copy-thin.svg`) — the full tunnel URL for that service is copied to your clipboard
4. If the service requires authentication, also click **🔑 Copy Token** (`key-thin.svg`) — the auth token is copied
5. Paste these into your AI tool's MCP configuration file

**Step 3 — Stop the tunnel:**
- Right-click the tray icon → **Tunnel** → ⏹️ **Stop Tunnel** (`stop-thin.svg`)

**Step 4 — Restart the tunnel (if something isn't working):**
- Right-click the tray icon → **Tunnel** → 🔄 **Restart Tunnel** (`arrows-clockwise-thin.svg`)

**Emergency kill (if the tunnel gets stuck):**
- Right-click the tray icon → **Tunnel** → 🗑️ **Force Kill Tunnel** (`trash-thin.svg`)

> **Tip:** The tunnel stays running even after you close the tray icon. You can always check its status by reopening the tray and hovering over the Tunnel menu.

#### Tunnel status indicators

| Status | Meaning |
|--------|---------|
| **ACTIVE** | Tunnel is running, external connections allowed |
| **Starting…** | Tunnel is initializing (wait a few seconds) |
| **Off** | Tunnel is not running |

#### Troubleshooting the tunnel

| Problem | Solution |
|---------|----------|
| **Tunnel won't start** | Check that SSH is installed. On Windows, ensure OpenSSH Client is enabled (Settings → Apps → Optional Features). |
| **"OAuth adapter did not respond"** | Port 8769 may be in use. The Force Kill option clears all processes using this port. |
| **Tunnel starts but AI tools can't connect** | Try **Restart Tunnel** — this kills and re-creates the SSH tunnel with a fresh connection. |
| **"Address already in use"** | Use **Force Kill Tunnel** to clear orphaned processes, then try Start again. |
| **Connection drops after some time** | Serveo free tunnels may time out after 30 minutes of inactivity. Simply **Restart Tunnel** to reconnect. |

---

## Stopping and starting services

### Stop all services

**If you used the PowerShell script (`install-native.ps1`):**
Double-click the file:
```
C:\context-manager\cm-off.bat
```
Or in PowerShell:
```powershell
C:\context-manager\cm-off.bat
```

**If you used the .exe installer:**
Open PowerShell as Administrator and run:
```powershell
nssm stop cm-watchdog
nssm stop cm-mcp
nssm stop cm-api
nssm stop cm-embed
nssm stop cm-qdrant
```

### Start all services

Open PowerShell as Administrator and run:
```powershell
nssm start cm-qdrant
nssm start cm-embed
nssm start cm-api
nssm start cm-mcp
nssm start cm-watchdog
```

### Restart all services

**If you used the PowerShell script (`install-native.ps1`):**
Double-click the file:
```
C:\context-manager\cm-restart.bat
```

**If you used the .exe installer:**
Run the stop commands above, then the start commands.

### Check if services are running

In PowerShell:
```powershell
Get-Service cm-*, cm-qdrant, cm-embed
```

You should see all services with status "Running".

---

## Finding help and logs

### If something goes wrong

1. **Check the health:** Open browser, go to `http://localhost:3847/health`
2. **Check the logs:** Open File Explorer, navigate to `C:\ProgramData\nssm\logs\`
3. **Look for errors:** Open the most recent `.log` file with Notepad

### Log files location

| Service | Log file |
|---------|----------|
| Context Manager API | `C:\ProgramData\nssm\logs\cm-api.log` |
| ONNX Embedder | `C:\ProgramData\nssm\logs\cm-embed.log` |
| MCP Adapter | `C:\ProgramData\nssm\logs\cm-mcp.log` |
| Watchdog | `C:\ProgramData\nssm\logs\cm-watchdog.log` |
| Qdrant | `C:\ProgramData\nssm\logs\cm-qdrant.log` |

### Config file location

Your configuration is in:
- **.exe installer:** `C:\ProgramData\Context Manager\app\.env`
- **PowerShell script:** `C:\context-manager\.env`

You can edit this with Notepad if you need to change settings (like database password).

---

## FAQ

### Q: "I get an error during installation"

**A:** Most likely cause:
- **"externally-managed-environment"** — Python 3.12+ issue. Try running the installer again — it should handle this automatically.
- **"winget not found"** — Windows 10 version too old. You need Windows 10 version 1903 or newer.
- **"access denied"** — You didn't run PowerShell as Administrator. Close it and reopen as Admin.

### Q: "Services don't start after I restart my computer"

**A:** Wait 30-60 seconds after boot. Services start automatically but ONNX model takes time to load. If they still don't start:
1. Open PowerShell as Administrator
2. Run: `Get-Service cm-*`
3. If any show "Stopped", start them manually: `nssm start cm-api`

### Q: "Claude Desktop doesn't see Context Manager"

**A:**
1. Make sure you ran the MCP config generator (see [Connecting to Claude Desktop](#connecting-to-claude-desktop))
2. Completely close Claude Desktop (right-click icon → Quit)
3. Open Claude Desktop again
4. Check: `http://localhost:3847/health` should show "healthy"

### Q: "Can I use Context Manager with multiple AI tools?"

**A:** Yes! You can connect Claude Desktop, Cursor, and other MCP-compatible tools at the same time. They all share the same context.

### Q: "Is my data sent to the cloud?"

**A:** No. Everything stays on your computer. Context Manager is 100% local.

### Q: "How do I uninstall Context Manager?"

**A:**

**If you used the .exe installer:**
1. Open PowerShell as Administrator and run:
   ```powershell
   nssm stop cm-watchdog
   nssm stop cm-mcp
   nssm stop cm-api
   nssm stop cm-embed
   nssm stop cm-qdrant
   nssm remove cm-watchdog confirm
   nssm remove cm-mcp confirm
   nssm remove cm-api confirm
   nssm remove cm-embed confirm
   nssm remove cm-qdrant confirm
   ```
2. Delete the folder: `C:\Program Files\Context Manager\`
3. Delete the data folder: `C:\ProgramData\Context Manager\`
4. (Optional) Uninstall PostgreSQL and Qdrant via Windows Settings → Apps

**If you used the PowerShell script (`install-native.ps1`):**
1. Stop all services: double-click `C:\context-manager\cm-off.bat`
2. Delete these folders: `C:\context-manager\` and `C:\qdrant\`
3. Open PowerShell as Administrator and run:
   ```powershell
   nssm remove cm-api confirm
   nssm remove cm-embed confirm
   nssm remove cm-mcp confirm
   nssm remove cm-qdrant confirm
   nssm remove cm-watchdog confirm
   ```
4. (Optional) Uninstall PostgreSQL and Qdrant via Windows Settings → Apps

### Q: "My antivirus blocks the installer"

**A:** Some antivirus software flags PowerShell scripts. You can:
1. Temporarily disable your antivirus
2. Or download the installer script first, then run it locally:
   ```powershell
   irm https://raw.githubusercontent.com/GG-QandV/context-manager/master/scripts/install-native.ps1 -OutFile install.ps1
   .\install.ps1
   ```

### Q: "I need more help"

**A:** Open an issue on GitHub: [github.com/GG-QandV/context-manager/issues](https://github.com/GG-QandV/context-manager/issues)

---

## Summary

| What | Where (if you used the installer `.exe`) | Where (if you used the PowerShell script) |
|------|------------------------------------------|-------------------------------------------|
| **Installed files** | `C:\Program Files\Context Manager\` | `C:\context-manager\` |
| **Config file** | `C:\ProgramData\Context Manager\app\.env` | `C:\context-manager\.env` |
| **Logs** | `C:\ProgramData\Context Manager\logs\cm-*.log` | `C:\ProgramData\nssm\logs\cm-*.log` |
| **Tray executable** | `C:\Program Files\Context Manager\embed\.venv\Scripts\pythonw.exe -m cm_integration.tray_pyqt` | `python -m cm_integration.tray_pyqt` (from `C:\context-manager`) |
| **Health check** | `http://localhost:3847/health` | `http://localhost:3847/health` |
| **Database** | PostgreSQL on port 5432 | PostgreSQL on port 5432 |
| **Search engine** | Qdrant on port 6333 | Qdrant on port 6333 |
| **AI embeddings** | ONNX on port 8080 | ONNX on port 8080 |
| **API** | Context Manager on port 3847 | Context Manager on port 3847 |
| **MCP adapter** | Port 8770 | Port 8770 |

---

*Last updated: June 2026 · Context Manager v2.2.1*
