"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const postgres_service_1 = require("./services/postgres.service");
// 1. ЗАМЕНА: импортируем qdrantService вместо weaviateService
const qdrant_service_1 = require("./services/qdrant.service");
async function start() {
    try {
        // 2. ЗАМЕНА: Инициализация схемы Qdrant
        console.log('Initializing Qdrant collection...');
        await qdrant_service_1.qdrantService.initializeSchema();
        // Start server
        await app_1.app.listen({
            port: config_1.config.port,
            host: config_1.config.host
        });
        console.log(`Context Manager server running on http://${config_1.config.host}:${config_1.config.port}`);
    }
    catch (err) {
        app_1.app.log.error(err);
        process.exit(1);
    }
}
// Graceful shutdown
async function shutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    try {
        await app_1.app.close();
        await postgres_service_1.postgresService.close();
        // 3. СОВЕТ: Можно добавить закрытие клиента Qdrant, если нужно, 
        // но обычно это не критично для rest-client
        console.log('Server closed successfully');
        process.exit(0);
    }
    catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Handle uncaught errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
start();
//# sourceMappingURL=index.js.map