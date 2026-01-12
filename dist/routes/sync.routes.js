"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncRoutes = syncRoutes;
const postgres_service_1 = require("../services/postgres.service");
// ЗАМЕНА ТУТ:
const qdrant_service_1 = require("../services/qdrant.service");
const config_1 = require("../config");
async function syncRoutes(fastify) {
    fastify.post('/api/context/sync', async (request, reply) => {
        try {
            const pendingRecords = await postgres_service_1.postgresService.getPendingSyncRecords(config_1.config.sync.batchSize);
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
            const { successful, failed } = await qdrant_service_1.qdrantService.batchCreateContexts(pendingRecords);
            await Promise.all([
                postgres_service_1.postgresService.batchUpdateSyncStatus(successful, 'synced'),
                postgres_service_1.postgresService.batchUpdateSyncStatus(failed, 'failed'),
            ]);
            return {
                success: true,
                synced: successful.length,
                failed: failed.length,
                total: pendingRecords.length,
            };
        }
        catch (err) {
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
        const pendingRecords = await postgres_service_1.postgresService.getPendingSyncRecords(1000);
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
//# sourceMappingURL=sync.routes.js.map