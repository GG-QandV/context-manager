import { app } from './app';
import { config } from './config';
import { postgresService } from './services/postgres.service';
import { qdrantService } from './services/qdrant.service';
import { migrateLegacyConfig, migrateLegacyMcp } from './config/migration';
import { startSyncWorker } from './workers/sync.worker';

let stopSyncWorker: (() => void) | null = null;

async function start() {
  try {
    await migrateLegacyConfig();
    await migrateLegacyMcp();

    console.log('Initializing Qdrant collection...');
    await qdrantService.initializeSchema();

    await app.listen({
      port: config.port,
      host: config.host,
    });

    console.log(`Context Manager server running on http://${config.host}:${config.port}`);

    const worker = startSyncWorker();
    stopSyncWorker = worker.stop;
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  if (stopSyncWorker) {
    stopSyncWorker();
  }

  try {
    await app.close();
    await postgresService.close();
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
