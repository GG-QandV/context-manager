# Context Manager API Service

The core orchestration service for managing AI Agent context, providing a bridge between structured PostgreSQL data and high-performance vector search.

## ✨ Features

- **Dual-Database Sync**: Automatic real-time synchronization between PostgreSQL and Qdrant.
- **Local Embeddings**: High-performance semantic processing using **multilingual-e5-small_Q8** via local TEI.
- **MCP Native**: Full support for Model Context Protocol to bridge agent memories.
- **RESTful API**: Secure endpoints built with Fastify for rapid context retrieval.

## 🛠 Setup & Installation

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

## 🔌 API Documentation

Detailed endpoint documentation can be found in `docs/` or inferred from the schemas in `src/schemas/`.

### Core Endpoints:
- `POST /v1/context`: Save new context entry.
- `GET /v1/context/search`: Semantic search over stored context.
- `GET /health`: System health status.

## 🏗 Architecture

The service is structured following modular patterns:
- `src/services`: Core logic (Sync, Qdrant/Postgres integration, local Embeddings).
- `src/routes`: API route definitions.
- `src/schemas`: Validation schemas (TypeBox).
- `resync_qdrant.py`: High-speed utility for re-embedding and forced vector sync.

---
**Maintained by:** GG-QandV  
**Part of:** [Context-MCP Infrastructure](../README.md)
