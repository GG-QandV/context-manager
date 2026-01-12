import { app } from './app';
import { config } from './config';
import { postgresService } from './services/postgres.service';
// 1. ЗАМЕНА: импортируем qdrantService вместо weaviateService
import { qdrantService } from './services/qdrant.service'; 

async function start() {
  try {
    // 2. ЗАМЕНА: Инициализация схемы Qdrant
    console.log('Initializing Qdrant collection...');
    await qdrantService.initializeSchema(); 
    
    // Start server
    await app.listen({ 
      port: config.port, 
      host: config.host 
    });
    
    console.log(`Context Manager server running on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  try {
    await app.close();
    await postgresService.close();
    // 3. СОВЕТ: Можно добавить закрытие клиента Qdrant, если нужно, 
    // но обычно это не критично для rest-client
    console.log('Server closed successfully');
    process.exit(0);
  } catch (err) {
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
