<div align="center">

# Context Manager

### Persistent memory for AI agents — PostgreSQL + vector search, zero cloud, works on Windows

[![Version](https://img.shields.io/badge/version-2.2.1-0d9488?style=flat-square&labelColor=555)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-0d9488?style=flat-square&labelColor=555)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white&labelColor=555)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white&labelColor=555)]()
[![Qdrant](https://img.shields.io/badge/Qdrant-181717?style=flat-square&logo=qdrant&logoColor=white&labelColor=555)]()
[![Windows](https://img.shields.io/badge/Windows-0078D4?style=flat-square&logo=windows&logoColor=white&labelColor=555)]()
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black&labelColor=555)]()
[![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white&labelColor=555)]()

</div>

Your AI agents — Claude, ChatGPT, Gemini, custom agents — talk to each other across sessions. Context Manager is the memory layer that makes this work: save context, search it semantically later, and keep your agents from forgetting what they did yesterday.

Runs on **Windows, Linux, and macOS**. No cloud required. No Docker required on Windows.

---

## See it in action

- **[Architecture & MCP Integration — Dark](https://htmlpreview.github.io/?https://github.com/GG-QandV/context-manager/blob/master/docs/cm-presentation/cm-presentation.html)** · [Light](https://htmlpreview.github.io/?https://github.com/GG-QandV/context-manager/blob/master/docs/cm-presentation/cm-presentation-light.html)
- **[Архітектура та MCP — темна](https://htmlpreview.github.io/?https://github.com/GG-QandV/context-manager/blob/master/docs/cm-presentation/cm-presentation-uk.html)** · [світла](https://htmlpreview.github.io/?https://github.com/GG-QandV/context-manager/blob/master/docs/cm-presentation/cm-presentation-light-uk.html)

---

## What it does

**Dual storage** — PostgreSQL keeps everything structured, Qdrant handles vector search. Changes sync automatically. No ETL pipelines, no glue code.

**Local embeddings** — runs `multilingual-e5-small` on your machine. No API keys, no cloud calls, no data leaving your network.

**MCP-native** — speaks Model Context Protocol out of the box. Claude Desktop, Antigravity, Cursor, and custom agents connect directly without adapters.

**Self-healing watchdog** — monitors every component, restarts what breaks, logs what happens. Set it and forget it.

---

## Quick start

### Windows 10/11

Open **PowerShell as Administrator** and run:

```powershell
irm https://raw.githubusercontent.com/GG-QandV/context-manager/master/scripts/install-native.ps1 | iex
```

This installs everything: PostgreSQL, Qdrant, the ONNX embedder, Context Manager itself, and the watchdog service. All registered as Windows services via nssm — they start automatically on boot, restart if they crash.

**What you get:**
| Component | What it does | Port |
|-----------|-------------|------|
| PostgreSQL | Stores context as structured data | 5432 |
| Qdrant | Vector search across stored context | 6333 |
| ONNX embedder | Turns text into embeddings (multilingual-e5-small, no cloud) | 8080 |
| Context Manager API | The main service you talk to | 3847 |
| MCP adapter | HTTP transport for MCP clients | 8770 |
| Watchdog | Monitors everything, restarts failures | — |

**Verify it's running:**
```powershell
curl http://localhost:3847/health
```

**Connect your agent:**
```powershell
node scripts/init-mcp-config.mjs
```

Then point Claude Desktop or Antigravity to the generated `mcp.json`.

### Linux (Docker)

```bash
docker compose up -d
```

### macOS (native)

```bash
# Prerequisites: PostgreSQL, Qdrant — install via Homebrew
brew install postgresql@16 qdrant/tap/qdrant

# Start services
brew services start postgresql@16
brew services start qdrant

# Create database
createdb context_db

# Install and run Context Manager
npm install
npm run dev
```

---

## What's next

Context Manager is designed to work with any AI agent. The roadmap:

| Provider | Status |
|----------|--------|
| Claude Desktop | ✅ Works now |
| Antigravity / Gemini | ✅ Works now |
| Custom MCP agents | ✅ Works now |
| ChatGPT memory layer | 🚧 In progress |
| Perplexity integration | 🚧 In progress |
| Graph layer (relationships between sessions) | 📝 Planned |

---

## For developers

### MCP tools

| Tool | What it does | Key params |
|------|-------------|------------|
| `cm_save_br` | Save a short summary | `content`, `agent` |
| `cm_save_im` | Save by topic (up to 3K chars) | `content`, `topics`, `agent` |
| `cm_save_fl` | Save the full log | `content`, `agent` |
| `cm_search` | Semantic search in your context | `q` (query), `n` (count) |
| `cm_query` | Search by date, agent, session | `date`, `agent`, `session_id` |
| `cm_cross` | Search another agent's context | `q`, `from` (agent name) |
| `cm_agents` | List all agents with record counts | — |
| `cm_stats` | Context statistics | `agent`, `session` |
| `cm_export` | Export session as JSON | `session` (required) |

### API endpoints

**Write:**
- `POST /api/context/save` — save new context
- `POST /api/context/config` — update config

**Search:**
- `POST /api/context/search` — full-text search (PostgreSQL)
- `POST /api/context/semantic-search` — semantic search (Qdrant)
- `POST /api/context/hybrid-search` — both combined
- `POST /api/context/query` — SQL-based query

**Manage:**
- `GET /api/context/session/:sessionId` — get context by session
- `GET /api/context/agents` — list agents
- `GET /api/context/stats` — statistics
- `GET /api/context/export` — export session
- `GET /api/context/config` — read config
- `GET /health` — health check

### Project structure

```
src/
├── services/       Core logic: Qdrant, PostgreSQL, sync, embeddings
├── routes/         API route handlers
├── schemas/        Validation schemas (TypeBox)
├── config/         Paths, migration, env
├── types/          TypeScript types
├── index.ts        Entry point
└── app.ts          Fastify app setup
mcp/
├── server.js       MCP stdio server (connected via mcp.json)
└── cm_http_adapter.mjs   MCP HTTP adapter
scripts/            Install, uninstall, MCP config generation
docs/               Presentations, architecture, adaptation guides
```

---

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

---

<sub>Maintained by **N** · Part of Context-Manager Infrastructure</sub>
