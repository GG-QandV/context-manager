import { FastifyInstance } from 'fastify';
import { postgresService } from '../services/postgres.service';
// ЗАМЕНА ТУТ:
import { qdrantService } from '../services/qdrant.service';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    try {
      // ЗАМЕНА ТУТ:
      const [pgHealthy, qdrantHealthy] = await Promise.all([
        postgresService.healthCheck(),
        qdrantService.healthCheck(),
      ]);

      const isHealthy = pgHealthy && qdrantHealthy;

      if (!isHealthy) {
        reply.code(503);
      }

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        postgresql: pgHealthy ? 'connected' : 'disconnected',
        // ЗАМЕНА ТУТ:
        qdrant: qdrantHealthy ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    } catch (error) {
      reply.code(500);
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  });

  fastify.get('/health/live', async () => {
    return { status: 'alive' };
  });

  fastify.get('/health/ready', async (request, reply) => {
    // ЗАМЕНА ТУТ:
    const [pgHealthy, qdrantHealthy] = await Promise.all([
      postgresService.healthCheck(),
      qdrantService.healthCheck(),
    ]);

    if (!pgHealthy || !qdrantHealthy) {
      reply.code(503);
      return { 
        status: 'not ready',
        postgresql: pgHealthy,
        // ЗАМЕНА ТУТ:
        qdrant: qdrantHealthy,
      };
    }

    return { status: 'ready' };
  });
}

