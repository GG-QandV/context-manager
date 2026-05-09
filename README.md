# Context Manager API Service

The core orchestration service for managing AI Agent context, providing a bridge between structured PostgreSQL data and high-performance vector search.

## Features

- **Dual-Database Sync**: Automatic real-time synchronization between PostgreSQL and Qdrant.
- **Local Embeddings**: High-performance semantic processing using **multilingual-e5-small_Q8** via local TEI.
- **MCP Native**: Full support for Model Context Protocol to bridge agent memories.
- **RESTful API**: Secure endpoints built with Fastify for rapid context retrieval.

## Setup & Installation

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

## API Documentation

Detailed endpoint documentation can be found in `src/schemas/`.

### Core Endpoints:

- `POST /v1/context`: Save new context entry.
- `GET /v1/context/search`: Semantic search over stored context.
- `GET /health`: System health status.
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

## License

Copyright 2026 GG-QandV (Yevhenii N.)

Licensed under the **Apache License, Version 2.0**.
You may use, modify, and distribute this software under the terms of the License.
A copy of the License is included in this repository: [LICENSE](./LICENSE)
Attribution must be preserved as defined in [NOTICE](./NOTICE).

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> [!WARNING]
> **Disclaimer**: This software is provided "as is", without warranty of any kind. Users use this software at their own risk.

---

**Maintained by:** GG-QandV  
**Part of:** [Context-Manager Infrastructure](../README.md)
