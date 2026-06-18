import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { postgresService } from '../services/postgres.service';
import { batchSync } from '../services/sync.service';
import type { ContextRecord } from '../types';

export async function syncRoutes(fastify: FastifyInstance) {
  fastify.post('/api/context/sync', async (request, reply) => {
    try {
      const result = await batchSync(config.sync.batchSize);

      return {
        success: true,
        ...result,
        message: result.total === 0 ? 'No pending records to sync' : undefined,
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
    const pendingRecords: ContextRecord[] = await postgresService.getPendingSyncRecords(1000);

    const pending = pendingRecords.filter((r: ContextRecord) => r.sync_status === 'pending').length;
    const failed = pendingRecords.filter((r: ContextRecord) => r.sync_status === 'failed').length;

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

