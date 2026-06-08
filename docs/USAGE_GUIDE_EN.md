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
8. [Stopping and starting services](#stopping-and-starting-services)
9. [Finding help and logs](#finding-help-and-logs)
10. [FAQ](#faq)

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

### Step 1: Open PowerShell as Administrator

1. Click the **Start button** (Windows logo in bottom-left corner)
2. Type `powershell`
3. Right-click on **Windows PowerShell** in the search results
4. Click **"Run as administrator"**
5. Click **Yes** if Windows asks "Do you want to allow this app to make changes?"

### Step 2: Run the installer

Copy and paste this entire line into the PowerShell window, then press Enter:

```powershell
irm https://raw.githubusercontent.com/GG-QandV/context-manager/master/scripts/install-native.ps1 | iex
```

### Step 3: Wait for it to finish

The installer will:
- Download and install PostgreSQL (database) — takes about 1 minute
- Download and install Qdrant (search engine) — takes about 30 seconds
- Download and install Node.js (if you don't have it) — takes about 1 minute
- Download and install Context Manager — takes about 2 minutes
- Download the AI model (multilingual-e5-small) — takes about 1 minute
- Start all services — takes about 30 seconds

**Total time:** 5-10 minutes depending on your internet speed.

**What you'll see:** The PowerShell window will show progress messages. When it says "Context Manager installed successfully", you're done!

### Step 4: Close PowerShell

You can close the PowerShell window now. Everything is installed and running.

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

Type this command and press Enter:

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
2. Navigate to `C:\context-manager`
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

- **Where is my data stored?** In PostgreSQL database at `C:\context-manager\data\`
- **Can I backup my data?** Yes, you can export context via the API
- **How much space does it use?** Usually a few megabytes per conversation
- **Does it slow down my computer?** No, it uses very little memory when idle

---

## Stopping and starting services

### Stop all services

Double-click the file:
```
C:\context-manager\cm-off.bat
```

Or in PowerShell:
```powershell
C:\context-manager\cm-off.bat
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

Double-click the file:
```
C:\context-manager\cm-restart.bat
```

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
```
C:\context-manager\.env
```

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
1. Make sure you ran `node scripts/init-mcp-config.mjs` from `C:\context-manager`
2. Completely close Claude Desktop (right-click icon → Quit)
3. Open Claude Desktop again
4. Check: `http://localhost:3847/health` should show "healthy"

### Q: "Can I use Context Manager with multiple AI tools?"

**A:** Yes! You can connect Claude Desktop, Cursor, and other MCP-compatible tools at the same time. They all share the same context.

### Q: "Is my data sent to the cloud?"

**A:** No. Everything stays on your computer. Context Manager is 100% local.

### Q: "How do I uninstall Context Manager?"

**A:**
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

| What | Where |
|------|-------|
| **Installed files** | `C:\context-manager\` |
| **Config file** | `C:\context-manager\.env` |
| **Logs** | `C:\ProgramData\nssm\logs\cm-*.log` |
| **Health check** | `http://localhost:3847/health` |
| **Stop services** | `C:\context-manager\cm-off.bat` |
| **Restart services** | `C:\context-manager\cm-restart.bat` |
| **Database** | PostgreSQL on port 5432 |
| **Search engine** | Qdrant on port 6333 |
| **AI embeddings** | ONNX on port 8080 |
| **API** | Context Manager on port 3847 |
| **MCP adapter** | Port 8770 |

---

*Last updated: June 2026 · Context Manager v2.2.1*
