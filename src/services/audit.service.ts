import { postgresService } from './postgres.service';
import { qdrantService } from './qdrant.service';

export interface AuditResult {
  missingInQdrant: string[];
  missingInPg: string[];
  syncedCount: number;
  distinctSyncIdCount: number;
}

export async function runAudit(): Promise<AuditResult> {
  const [pgSyncIds, qdrantSyncIds] = await Promise.all([
    postgresService.getAllSyncedSyncIds().catch((err: unknown) => {
      console.error('[Audit] Failed to fetch PG sync IDs:', err);
      throw err;
    }),
    qdrantService.getAllDistinctSyncIds().catch((err: unknown) => {
      console.error('[Audit] Failed to fetch Qdrant sync IDs:', err);
      throw err;
    }),
  ]);

  const pgSet = new Set(pgSyncIds);
  const qdrantSet = new Set(qdrantSyncIds);

  const missingInQdrant = pgSyncIds.filter(id => !qdrantSet.has(id));
  const missingInPg = qdrantSyncIds.filter(id => !pgSet.has(id));

  return {
    missingInQdrant,
    missingInPg,
    syncedCount: pgSyncIds.length,
    distinctSyncIdCount: qdrantSyncIds.length,
  };
}
