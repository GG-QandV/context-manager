# Context Manager API Service

<div align="center">

[![Version](https://img.shields.io/badge/version-2.2.1-0d9488?style=flat-square&labelColor=555)](https://github.com/GG-QandV/context-manager)
[![License](https://img.shields.io/badge/License-Apache%202.0-0d9488?style=flat-square&labelColor=555)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white&labelColor=555)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white&labelColor=555)]()
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white&labelColor=555)]()

</div>

The core orchestration service for managing AI Agent context — a bridge between structured PostgreSQL persistence and high-performance vector search via Qdrant, wrapped in a clean MCP-native API for seamless agent integration.

---

## Features

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="20" height="20" fill="#0d9488" style="vertical-align:middle;margin-right:6px"><path d="M192.14,42.55C174.94,33.17,152.16,28,128,28S81.06,33.17,63.86,42.55C45.89,52.35,36,65.65,36,80v96c0,14.35,9.89,27.65,27.86,37.45,17.2,9.38,40,14.55,64.14,14.55s46.94-5.17,64.14-14.55c18-9.8,27.86-23.1,27.86-37.45V80C220,65.65,210.11,52.35,192.14,42.55Z M212,176c0,11.29-8.41,22.1-23.69,30.43C172.27,215.18,150.85,220,128,220s-44.27-4.82-60.31-13.57C52.41,198.1,44,187.29,44,176V149.48c4.69,5.93,11.37,11.34,19.86,16,17.2,9.38,40,14.55,64.14,14.55s46.94-5.17,64.14-14.55c8.49-4.63,15.17-10,19.86-16Zm0-48c0,11.29-8.41,22.1-23.69,30.43C172.27,167.18,150.85,172,128,172s-44.27-4.82-60.31-13.57C52.41,150.1,44,139.29,44,128V101.48c4.69,5.93,11.37,11.34,19.86,16,17.2,9.38,40,14.55,64.14,14.55s46.94-5.17,64.14-14.55c8.49-4.63,15.17-10,19.86-16Zm-23.69-17.57C172.27,119.18,150.85,124,128,124s-44.27-4.82-60.31-13.57C52.41,102.1,44,91.29,44,80s8.41-22.1,23.69-30.43C83.73,40.82,105.15,36,128,36s44.27,4.82,60.31,13.57C203.59,57.9,212,68.71,212,80S203.59,102.1,188.31,110.43Z"/></svg> **Dual-Database Sync** — Automatic real-time synchronization between PostgreSQL and Qdrant.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="20" height="20" fill="#0d9488" style="vertical-align:middle;margin-right:6px"><path d="M172,232a4,4,0,0,1-4,4H88a4,4,0,0,1,0-8h80A4,4,0,0,1,172,232Zm40-128a83.59,83.59,0,0,1-32.11,66.06A20.2,20.2,0,0,0,172,186v6a12,12,0,0,1-12,12H96a12,12,0,0,1-12-12v-6a20,20,0,0,0-7.76-15.81A83.58,83.58,0,0,1,44,104.47C43.75,59,80.52,21.09,126,20a84,84,0,0,1,86,84Zm-8,0a76,76,0,0,0-77.83-76C85,29,51.77,63.27,52,104.43a75.62,75.62,0,0,0,29.17,59.43A28,28,0,0,1,92,186v6a4,4,0,0,0,4,4h64a4,4,0,0,0,4-4v-6a28.14,28.14,0,0,1,10.94-22.2A75.62,75.62,0,0,0,204,104Z M136.66,52.06a4,4,0,0,0-1.32,7.88C153.53,63,169,78.45,172.06,96.67A4,4,0,0,0,176,100a3.88,3.88,0,0,0,.67-.06,4,4,0,0,0,3.27-4.61A53.51,53.51,0,0,0,136.66,52.06Z"/></svg> **Local Embeddings** — High-performance semantic processing using **multilingual-e5-small_Q8** via local TEI, no cloud dependencies.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="20" height="20" fill="#0d9488" style="vertical-align:middle;margin-right:6px"><path d="M234.83,21.17a4,4,0,0,0-5.66,0L173.94,76.4l-8.2-8.2a28,28,0,0,0-39.6,0L100,94.34l-9.17-9.17a4,4,0,0,0-5.66,5.66L94.34,100,68.2,126.14a28,28,0,0,0,0,39.6l8.2,8.2L21.17,229.17a4,4,0,0,0,5.66,5.66L82.06,179.6l8.2,8.2a28,28,0,0,0,39.6,0L156,161.66l9.17,9.17a4,4,0,0,0,5.66-5.66L161.66,156l26.14-26.14a28,28,0,0,0,0-39.6l-8.2-8.2,55.23-55.23A4,4,0,0,0,234.83,21.17Z M123.2,182.2a20,20,0,0,1-28.28,0L73.86,160.08a20,20,0,0,1,0-28.28L100,105.66,150.34,156Z M181.14,124.2L156,150.34,105.66,100,131.8,73.86a20,20,0,0,1,28.28,0l22.06,22.06A20,20,0,0,1,182.14,124.2Z M92.29,33.49a4,4,0,1,1,7.42-3l8,20a4,4,0,0,1-2.22,5.2A3.91,3.91,0,0,1,104,56a4,4,0,0,1-3.71-2.51Z M28.29,94.51a4,4,0,0,1,5.2-2.22l20,8A4,4,0,0,1,52,108a3.91,3.91,0,0,1-1.49-.29l-20-8A4,4,0,0,1,28.29,94.51Z M227.71,161.49a4,4,0,0,1-5.2,2.22l-20-8a4,4,0,1,1,3-7.42l20,8A4,4,0,0,1,227.71,161.49Z M163.71,222.49a4,4,0,0,1-2.22,5.2A3.91,3.91,0,0,1,160,228a4,4,0,0,1-3.71-2.51l-8-20a4,4,0,0,1,7.42-3Z"/></svg> **MCP Native** — Full support for Model Context Protocol to bridge agent memories across sessions.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="20" height="20" fill="#0d9488" style="vertical-align:middle;margin-right:6px"><path d="M218.14,161.93a4,4,0,0,0-3.86-.24,24,24,0,0,1-34.23-23.25,24,24,0,0,1,34.23-20.13A4,4,0,0,0,220,114.7V72a12,12,0,0,0-12-12H167a32,32,0,1,0-62.91-10.33A32.57,32.57,0,0,0,105,60H64A12,12,0,0,0,52,72v37a32,32,0,1,0-10.33,62.91A32.28,32.28,0,0,0,52,171v37a12,12,0,0,0,12,12H208a12,12,0,0,0,12-12V165.31A4,4,0,0,0,218.14,161.93Z M212,208a4,4,0,0,1-4,4H64a4,4,0,0,1-4-4V165.31a4,4,0,0,0-1.86-3.38,4,4,0,0,0-3.85-.24,24,24,0,0,1-34.24-20.13,24,24,0,0,1,34.24-23.25A4,4,0,0,0,60,114.7V72a4,4,0,0,1,4-4h46.69a4,4,0,0,0,3.62-5.71,24,24,0,0,1,20.13-34.24,24,24,0,0,1,23.25,34.24A4,4,0,0,0,161.31,68H208a4,4,0,0,1,4,4v37a32.57,32.57,0,0,0-10.33-.94A32,32,0,1,0,212,171Z"/></svg> **RESTful API** — Secure endpoints built with Fastify for rapid context retrieval and management.

## What's Next

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="20" height="20" fill="#0d9488" style="vertical-align:middle;margin-right:6px"><path d="M136,120a8,8,0,1,1-8-8A8,8,0,0,1,136,120Zm-52-8a8,8,0,1,0,8,8A8,8,0,0,0,84,112Zm88,0a8,8,0,1,0,8,8A8,8,0,0,0,172,112Zm56-56V184a12,12,0,0,1-12,12H153.25L138.42,222a12,12,0,0,1-20.84,0L102.75,196H40a12,12,0,0,1-12-12V56A12,12,0,0,1,40,44H216A12,12,0,0,1,228,56Zm-8,0a4,4,0,0,0-4-4H40a4,4,0,0,0-4,4V184a4,4,0,0,0,4,4h65.07a4,4,0,0,1,3.47,2l16,28a4,4,0,0,0,6.94,0l16-28a4,4,0,0,1,3.47-2H216a4,4,0,0,0,4-4Z"/></svg> Connecting Context Manager to your favorite AI chat providers — bringing persistent memory to everyday conversations:

- **ChatGPT** — persistent memory layer for OpenAI chats
- **Claude** — context persistence across Claude.ai sessions
- **Perplexity** — search-augmented memory for Perplexity AI
- **Grok** — X's AI assistant with Context Manager memory

## Setup & Installation

### Windows 10/11 (One-Click Auto-Install)

For a fully automated silent installation on Windows (installs Node, Python, PostgreSQL, Qdrant, ONNX Model, and registers background services), open **PowerShell as Administrator** and run:

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/YOUR_ORG/context-manager/main/scripts/install-native.ps1" -OutFile "$env:TEMP\install-native.ps1"; & "$env:TEMP\install-native.ps1"
```

*(Note: Replace `YOUR_ORG` with your actual GitHub organization or username before publishing.)*

### Environment Variables

Create a `.env` file in this directory (refer to `.env.example` if available or the internal list):

```ini
PORT=3847
DATABASE_URL=postgresql://user:pass@host:5433/context_db
QDRANT_HOST=localhost
QDRANT_PORT=6333
TEI_HOST=http://localhost:8080
# ... see full list in .env
```

### Running Locally

```bash
npm install
npm run dev
```

### Running via Docker

```bash
docker build -t context-manager .
docker run -p 3847:3847 --env-file .env context-manager
```

## Windows — настройка MCP

После установки обязательно запустить генерацию MCP конфига:

```powershell
node scripts/init-mcp-config.mjs
```

Это создаёт `mcp.json` с абсолютным путём к `server.js`.  
**Не использовать** `mcp.json` из репозитория напрямую — он содержит относительный путь  
и работает только при запуске из директории проекта.

### Подключение к IDE

**Claude Desktop:**
```powershell
Copy-Item mcp.json "$env:APPDATA\Claude\claude_desktop_config.json"
```

**Cursor / VS Code MCP:**  
Открыть Settings → MCP → указать путь из сгенерированного `mcp.json`.

## API Documentation

Detailed endpoint documentation can be found in `src/schemas/`.

### Core Endpoints:

- `POST /api/context/save`: Save new context entry.
- `GET /api/context/session/:sessionId`: Retrieve context by session ID.
- `POST /api/context/search`: Full-text search over stored context (PostgreSQL).
- `POST /api/context/semantic-search`: Semantic search over stored context (Qdrant).
- `POST /api/context/hybrid-search`: Combined full-text + semantic search.
- `GET /health`: System health status.
- `GET /api/context/stats`: Database statistics.
- `GET /api/context/agents`: List all known agents.
- `GET /api/context/export`: Export contexts (by session/agent).
- `GET /api/context/config`: Read config file.
- `POST /api/context/config`: Update config file.
- `POST /api/context/query`: Low-level SQL-based query interface.

## Model Context Protocol (MCP) Tools

The service provides a comprehensive suite of tools for AI Agent integration:

| Tool         | Description              | Parameters                                  |
| ------------ | ------------------------ | ------------------------------------------- |
| `cm_save_br` | Save context (Brief)     | `content` (auto-summary 200-300 chars)      |
| `cm_save_im` | Save context (Important) | `content`, `topics` (topics-based summary)  |
| `cm_save_fl` | Save context (Full)      | `content` (complete session log)            |
| `cm_search`  | Semantic Search          | `q` (query), `agent`, `n` (results count)   |
| `cm_query`   | SQL-based Search         | `date`, `agent`, `session_id`, `mode`       |
| `cm_cross`   | Cross-Agent Search       | `q` (query), `from` (source agent)          |
| `cm_agents`  | List Agents              | List all active agents with record counts   |
| `cm_stats`   | Statistics               | Context stats for specific agent or session |
| `cm_export`  | Export Session           | Export session data to JSON format          |

## Architecture

The service is structured following modular patterns:

- `src/services`: Core logic (Sync, Qdrant/Postgres integration, local Embeddings).
- `src/routes`: API route definitions.
- `src/schemas`: Validation schemas (TypeBox).
- `resync_qdrant.py`: High-speed utility for re-embedding and forced vector sync.

## Presentation

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="20" height="20" fill="#0d9488" style="vertical-align:middle;margin-right:6px"><path d="M216,44H132V24a4,4,0,0,0-8,0V44H40A12,12,0,0,0,28,56V176a12,12,0,0,0,12,12H87.68l-26.8,33.5a4,4,0,1,0,6.24,5L97.92,188h60.16l30.8,38.5a4,4,0,0,0,6.24-5L168.32,188H216a12,12,0,0,0,12-12V56A12,12,0,0,0,216,44Zm4,132a4,4,0,0,1-4,4H40a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4H216a4,4,0,0,1,4,4Z M100,120v24a4,4,0,0,1-8,0V120a4,4,0,0,1,8,0Zm32-16v40a4,4,0,0,1-8,0V104a4,4,0,0,1,8,0Zm32-16v56a4,4,0,0,1-8,0V88a4,4,0,0,1,8,0Z"/></svg> Explore the Context Manager architecture, features, and MCP integration through interactive presentations:

- **[Context Manager: Persistent Memory for AI Agents — Architecture, MCP Integration & API Reference](https://htmlpreview.github.io/?https://github.com/GG-QandV/context-manager/blob/master/docs/cm-presentation/cm-presentation.html)** — EN, Dark theme
- **[Context Manager: Persistent Memory for AI Agents — Architecture, MCP Integration & API Reference](https://htmlpreview.github.io/?https://github.com/GG-QandV/context-manager/blob/master/docs/cm-presentation/cm-presentation-light.html)** — EN, Light theme
- **[Контекстний Менеджер: Постійна Пам'ять для AI-агентів — Архітектура, MCP Інтеграція та API](https://htmlpreview.github.io/?https://github.com/GG-QandV/context-manager/blob/master/docs/cm-presentation/cm-presentation-uk.html)** — UA, Dark theme
- **[Контекстний Менеджер: Постійна Пам'ять для AI-агентів — Архітектура, MCP Інтеграція та API](https://htmlpreview.github.io/?https://github.com/GG-QandV/context-manager/blob/master/docs/cm-presentation/cm-presentation-light-uk.html)** — UA, Light theme

> HTML-файли лежать в `docs/cm-presentation/`. GitHub не рендерить `.html` як сторінки — посилання використовують `htmlpreview.github.io` для коректного відображення.

> [!WARNING]
> **Disclaimer**: This software is provided "as is", without warranty of any kind. Users use this software at their own risk.

---

## License

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="18" height="18" fill="#0d9488" style="vertical-align:middle;margin-right:4px"><path d="M208,44H48A12,12,0,0,0,36,56v56c0,51.16,24.73,82.12,45.47,99.1,22.4,18.32,44.55,24.5,45.48,24.76a4,4,0,0,0,2.1,0c.93-.26,23.08-6.44,45.48-24.76,20.74-17,45.47-47.94,45.47-99.1V56A12,12,0,0,0,208,44Zm4,68c0,38.44-14.23,69.63-42.29,92.71A132.45,132.45,0,0,1,128,227.82a132.23,132.23,0,0,1-41.71-23.11C58.23,181.63,44,150.44,44,112V56a4,4,0,0,1,4-4H208a4,4,0,0,1,4,4Z M170.83,101.17a4,4,0,0,1,0,5.66l-56,56a4,4,0,0,1-5.66,0l-24-24a4,4,0,0,1,5.66-5.66L112,154.34l53.17-53.17A4,4,0,0,1,170.83,101.17Z"/></svg> Copyright 2026 GG-QandV (Yevhenii N.)

Licensed under the **Apache License, Version 2.0**. You may use, modify, and distribute this software under the terms of the License. A copy of the License is included in this repository: [LICENSE](./LICENSE). Attribution must be preserved as defined in [NOTICE](./NOTICE).

---

**Maintained by:** N  
**Part of:** [Context-Manager Infrastructure](../README.md)
