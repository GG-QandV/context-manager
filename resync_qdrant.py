#!/usr/bin/env python3
"""
resync_qdrant.py — Re-embed and sync failed PostgreSQL records to Qdrant.

Finds all records with sync_status='failed', embeds them via TEI,
upserts into Qdrant, and marks sync_status='synced' in PostgreSQL.
"""

import json
import sys
import time
import urllib.request
import urllib.error
from datetime import timezone

# ── Config ────────────────────────────────────────────────────────────
import os

# ── Config ────────────────────────────────────────────────────────────
PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = int(os.getenv("PG_PORT", "5432"))
PG_DB   = os.getenv("PG_DB", "context_db")
PG_USER = os.getenv("PG_USER", "postgres")
PG_PASS = os.getenv("PG_PASS", "")


TEI_URL     = os.getenv("TEI_URL", "http://localhost:8080")
QDRANT_URL  = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION  = "DevelopmentContext"

BATCH_SIZE  = 4   # stay under max-concurrent-requests 8
RETRY_MAX   = 3
RETRY_DELAY = 2   # seconds between retries


# ── Helpers ───────────────────────────────────────────────────────────

def http_post(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Call TEI /embed for a batch of texts, return list of vectors."""
    for attempt in range(RETRY_MAX):
        try:
            result = http_post(f"{TEI_URL}/embed", {"inputs": texts})
            return result  # list of vectors
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < RETRY_MAX - 1:
                print(f"    TEI 429 — retry {attempt+1}/{RETRY_MAX}")
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                raise


def upsert_qdrant(points: list[dict]) -> None:
    data = json.dumps({"points": points}).encode()
    req = urllib.request.Request(
        f"{QDRANT_URL}/collections/{COLLECTION}/points?wait=true",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.loads(r.read())
    if result.get("status") != "ok":
        raise RuntimeError(f"Qdrant error: {result}")


# ── Main ──────────────────────────────────────────────────────────────

def main():
    try:
        import psycopg2
    except ImportError:
        print("Installing psycopg2-binary...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install",
                               "psycopg2-binary", "-q"])
        import psycopg2

    conn = psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_DB,
        user=PG_USER, password=PG_PASS,
    )
    cur = conn.cursor()

    # Count failed
    cur.execute("SELECT COUNT(*) FROM development_context WHERE sync_status='failed'")
    total = cur.fetchone()[0]
    print(f"Found {total} failed records to resync")

    if total == 0:
        print("Nothing to do.")
        return

    # Fetch all failed records
    cur.execute("""
        SELECT id, sync_id, session_id, context_type, content, summary,
               tags, tech_tags, project_id, logical_section, module,
               phase, priority, deployment_stage, market_phase,
               created_at, metadata
        FROM development_context
        WHERE sync_status = 'failed'
        ORDER BY created_at
    """)
    rows = cur.fetchall()

    synced = 0
    errors = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        print(f"\nBatch {i//BATCH_SIZE + 1}: records {i+1}–{min(i+BATCH_SIZE, total)}")

        # Build texts to embed (summary preferred, fallback to content[:1000])
        texts = []
        for row in batch:
            _, _, _, _, content, summary, *_ = row
            text = (summary or content or "")[:1000].strip()
            texts.append(text or " ")  # TEI rejects empty strings

        # Embed
        try:
            vectors = embed_batch(texts)
        except Exception as e:
            print(f"  Embed error: {e} — skipping batch")
            errors += len(batch)
            continue

        # Build Qdrant points
        points = []
        ids_to_update = []
        for row, vector in zip(batch, vectors):
            (rec_id, sync_id, session_id, context_type, content, summary,
             tags, tech_tags, project_id, logical_section, module,
             phase, priority, deployment_stage, market_phase,
             created_at, metadata) = row

            agent = (metadata or {}).get("agent", "unknown") if metadata else "unknown"
            ts = created_at.replace(tzinfo=timezone.utc).isoformat() if created_at else None

            points.append({
                "id": str(rec_id),
                "vector": vector,
                "payload": {
                    "agent": agent,
                    "sessionId": session_id,
                    "contextType": context_type,
                    "content": (summary or content or "")[:500],
                    "originalContent": content or "",
                    "summary": summary or "",
                    "tags": list(tags) if tags else [],
                    "techTags": list(tech_tags) if tech_tags else [],
                    "timestamp": ts,
                    "projectId": project_id or "default",
                    "syncId": sync_id,
                    "logicalSection": logical_section,
                    "module": module,
                    "phase": phase,
                    "priority": priority,
                    "deploymentStage": deployment_stage,
                    "marketPhase": market_phase,
                    "chunkIndex": 0,
                },
            })
            ids_to_update.append(str(rec_id))

        # Upsert to Qdrant
        try:
            upsert_qdrant(points)
        except Exception as e:
            print(f"  Qdrant upsert error: {e} — skipping batch")
            errors += len(batch)
            continue

        # Mark synced in PostgreSQL
        cur.execute(
            "UPDATE development_context SET sync_status='synced', synced_at=NOW() "
            "WHERE id = ANY(%s::uuid[])",
            (ids_to_update,),
        )
        conn.commit()
        synced += len(batch)
        print(f"  ✓ {len(batch)} records synced")

    cur.close()
    conn.close()

    print(f"\n{'='*40}")
    print(f"Done: {synced} synced, {errors} errors out of {total} total")

    # Final check
    import urllib.request as ur
    req = ur.Request(f"{QDRANT_URL}/collections/{COLLECTION}",
                     headers={"Content-Type": "application/json"})
    with ur.urlopen(req) as r:
        info = json.loads(r.read())
    print(f"Qdrant points_count: {info['result']['points_count']}")


if __name__ == "__main__":
    main()
