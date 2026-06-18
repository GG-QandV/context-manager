import { FastifyInstance } from 'fastify';
import { runAudit } from '../services/audit.service';

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.get('/api/context/sync/audit', async (request, reply) => {
    try {
      const result = await runAudit();
      return {
        success: true,
        audit: {
          syncedInPg: result.syncedCount,
          distinctSyncIdsInQdrant: result.distinctSyncIdCount,
          missingInQdrant: result.missingInQdrant,
          missingInPg: result.missingInPg,
          hasDiscrepancies:
            result.missingInQdrant.length > 0 || result.missingInPg.length > 0,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      request.log.error({ err: message }, 'Audit failed');
      reply.code(500);
      return { success: false, error: message };
    }
  });
}
