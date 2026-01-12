"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
const postgres_service_1 = require("../services/postgres.service");
// ЗАМЕНА ТУТ:
const qdrant_service_1 = require("../services/qdrant.service");
async function healthRoutes(fastify) {
    fastify.get('/health', async (request, reply) => {
        try {
            // ЗАМЕНА ТУТ:
            const [pgHealthy, qdrantHealthy] = await Promise.all([
                postgres_service_1.postgresService.healthCheck(),
                qdrant_service_1.qdrantService.healthCheck(),
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
        }
        catch (error) {
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
            postgres_service_1.postgresService.healthCheck(),
            qdrant_service_1.qdrantService.healthCheck(),
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
//# sourceMappingURL=health.routes.js.map