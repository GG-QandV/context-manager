# Changelog

All notable changes to Context Manager will be documented in this file.

## [2.2.1] — 2026-06-04

### Added
- Windows 10/11 native installer (Inno Setup + PowerShell)
- SSH tunneling, OAuth/SSE adapters, and tray UI with SVG icons
- `change-pg-password.ps1` for PostgreSQL password management
- ONNX embedder spec (multilingual-e5-small INT8, ~40MB)
- 7-layer Windows test specification
- Cross-platform config paths (`~/.context-manager/` on all platforms)
- NLP time parser (`timeParser.service.ts`) — "yesterday", "last N days"
- Content type detector (`contentDetector.service.ts`) — code, commands, tables, errors
- Config migration from `~/.iflow/` to new paths

### Fixed
- Windows environment variables, paths, and .env handling
- Workflow v2.0 — resolved all 9 bugs from GAPS_AUDIT
- Presentation: Docker Desktop optional on Windows (native nssm install)
- MCP strict agent validation in tool schemas

### Changed
- License migrated from MIT to Apache 2.0
- Config paths centralized with cross-platform support
- README redesigned with badges, SVG icons, marketing presentation

## [2.2.0] — 2026-01-28

### Added
- MCP stdio transport + agent metadata (Postgres GIN index, Qdrant payload)
- Agent isolation, brief/important fields, semantic filters
- Async RAG sync and MCP server integration
- MCP HTTP adapter (`cm_http_adapter.mjs`, port 8770)
- PostgreSQL `executeRawQuery` for complex queries
- `/query`, `/config` endpoints
- Batch 1-7: Full MCP integration pipeline

### Fixed
- Content brief/important saving bug
- Missing stats, agents, export endpoints in context.routes.ts

## [2.1.0] — 2026-01-20

### Added
- Initial Context Manager implementation
- PostgreSQL + Qdrant storage
- Fastify API on port 3847
- Semantic search via Qdrant vectors
- Health check endpoints
- Docker compose setup with TEI embeddings

---

For a detailed commit history, see `git log --oneline --since="2026-01-01"`.
