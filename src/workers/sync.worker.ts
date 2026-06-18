import { config } from '../config';
import { batchSync } from '../services/sync.service';

export function startSyncWorker(): { stop: () => void } {
  if (!config.sync.enabled) {
    console.log('Sync worker disabled via config.sync.enabled');
    return { stop: () => {} };
  }

  console.log(
    `Starting sync worker (interval: ${config.sync.intervalMs}ms, batch: ${config.sync.batchSize})`
  );

  const intervalId = setInterval(async () => {
    try {
      const result = await batchSync(config.sync.batchSize);
      console.log(
        `Sync worker: ${result.synced} synced, ${result.failed} failed, ${result.total} total`
      );
    } catch (err) {
      console.error('Sync worker failed:', err);
    }
  }, config.sync.intervalMs);

  return {
    stop: () => {
      clearInterval(intervalId);
      console.log('Sync worker stopped');
    },
  };
}
