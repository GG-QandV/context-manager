import { FastifyInstance } from 'fastify';
import { postgresService } from '../services/postgres.service';
// ЗАМЕНА ТУТ:
import { qdrantService } from '../services/qdrant.service';
import { config } from '../config';

export async function syncRoutes(fastify: FastifyInstance) {
  fastify.post('/api/context/sync', async (request, reply) => {
    try {
      const pendingRecords = await postgresService.getPendingSyncRecords(
        config.sync.batchSize
      );

      if (pendingRecords.length === 0) {
        return {
          success: true,
          synced: 0,
          failed: 0,
          total: 0,
          message: 'No pending records to sync',
        };
      }

      // ЗАМЕНА ТУТ:
      const { successful, failed } = await qdrantService.batchCreateContexts(
        pendingRecords
      );

      await Promise.all([
        postgresService.batchUpdateSyncStatus(successful, 'synced'),
        postgresService.batchUpdateSyncStatus(failed, 'failed'),
      ]);

      return {
        success: true,
        synced: successful.length,
        failed: failed.length,
        total: pendingRecords.length,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      request.log.error({ err: errorMessage }, 'Sync failed');
      reply.code(500);
      return {
        success: false,
        error: errorMessage,
      };
    }
  });

  fastify.get('/api/context/sync/status', async () => {
    const pendingRecords = await postgresService.getPendingSyncRecords(1000);
    
    const pending = pendingRecords.filter(r => r.sync_status === 'pending').length;
    const failed = pendingRecords.filter(r => r.sync_status === 'failed').length;

    return {
      success: true,
      status: {
        pending,
        failed,
        total: pending + failed,
      },
    };
  });
}

