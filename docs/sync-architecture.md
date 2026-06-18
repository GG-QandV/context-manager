# Sync Architecture — context-manager

## Overview

context-manager maintains two data stores:
- **PostgreSQL** — primary storage, full records with `sync_status` tracking
- **Qdrant** — vector search, chunked points with embeddings

Every saved record starts as `sync_status='pending'` in PG and is asynchronously synced to Qdrant.

## Flow

```
Save → PG (sync_status='pending')
         │
         ▼
    Sync Worker (periodic)
    or POST /api/context/sync
         │
         ▼
    batchSync():
      1. SELECT * FROM development_context
         WHERE sync_status IN ('pending','failed')
         ORDER BY created_at ASC
         LIMIT batchSize
      2. qdrantService.batchCreateContexts(records)
         → embed via TEI, chunk, upsert to Qdrant
      3. batchUpdateSyncStatus(successful, 'synced')
         batchUpdateSyncStatus(failed, 'failed')
```

## Data Model

### PostgreSQL (`development_context`)

| Column | Type | Description |
|--------|------|-------------|
| `sync_id` | text | Unique ID generated on save |
| `sync_status` | text | `pending` / `synced` / `failed` |
| `synced_at` | timestamptz | When synced (NULL if not synced) |
| `content` | text | Full content |
| `metadata` | jsonb | Agent, mode, etc. |

### Qdrant (collection: `DevelopmentContext`)

Each PG record produces **1 or more points** (one per chunk after embedding). All points share the same `syncId` in payload.

| Payload field | Source |
|---------------|--------|
| `syncId` | `sync_id` from PG |
| `agent` | `metadata->>'agent'` |
| `sessionId` | `session_id` |
| `content` | chunk text |
| `originalContent` | full `content` |
| `chunkIndex` | position within chunks (0, 1, 2…) |

## Periodic Sync Worker

New in v2.2.1 (bug #4). Optional background worker that runs `batchSync()` at a fixed interval.

| Env var | Default | Description |
|---------|---------|-------------|
| `SYNC_ENABLED` | `true` | Set to `false` to disable |
| `SYNC_INTERVAL_MS` | `60000` | Milliseconds between sync runs |
| `SYNC_BATCH_SIZE` | `100` | Records per batch |

Worker starts after server boot in `src/index.ts` and stops on graceful shutdown.

## Manual Sync

- `POST /api/context/sync` — triggers one batch sync round
- `GET /api/context/sync/status` — returns pending/failed counts
- `resync_qdrant.py` — re-embed and re-sync all `sync_status='failed'` records (standalone script)

## Error Handling

- Per-record error isolation: one failed record doesn't block the batch
- Failed records keep `sync_status='failed'` and are retried on the next sync run
- Worker logs errors but never crashes the server
- Startup alert (console.warn) if any `sync_status='failed'` records exist

## Files

| File | Role |
|------|------|
| `src/services/sync.service.ts` | Core `batchSync()` logic |
| `src/workers/sync.worker.ts` | Periodic worker |
| `src/routes/sync.routes.ts` | HTTP endpoints: POST sync, GET status |
| `src/services/postgres.service.ts` | PG queries (`getPendingSyncRecords`, `batchUpdateSyncStatus`) |
| `src/services/qdrant.service.ts` | Qdrant `batchCreateContexts`, chunking + embedding |
| `resync_qdrant.py` | Standalone failed-record recovery script |
