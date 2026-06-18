import { postgresService } from './postgres.service';
import { qdrantService } from './qdrant.service';

export interface BatchSyncResult {
  synced: number;
  failed: number;
  total: number;
}

export async function batchSync(batchSize: number): Promise<BatchSyncResult> {
  const pendingRecords = await postgresService.getPendingSyncRecords(batchSize);

  if (pendingRecords.length === 0) {
    return { synced: 0, failed: 0, total: 0 };
  }

  const { successful, failed } = await qdrantService.batchCreateContexts(pendingRecords);

  await Promise.all([
    postgresService.batchUpdateSyncStatus(successful, 'synced'),
    postgresService.batchUpdateSyncStatus(failed, 'failed'),
  ]);

  return {
    synced: successful.length,
    failed: failed.length,
    total: pendingRecords.length,
  };
}
