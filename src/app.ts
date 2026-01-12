import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.routes';
import { contextRoutes } from './routes/context.routes';
import { searchRoutes } from './routes/search.routes';
import { syncRoutes } from './routes/sync.routes';
import { errorHandler } from './middleware/error-handler';

const isDev = process.env.NODE_ENV === 'development';

export const app = Fastify({ 
  logger: isDev 
    ? {
        level: process.env.LOG_LEVEL || 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        }
      }
    : {
        level: process.env.LOG_LEVEL || 'info'
      }
});

// Register plugins
app.register(cors, {
  origin: process.env.CORS_ORIGIN || true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// Global error handler
app.setErrorHandler(errorHandler);

// Register routes
app.register(healthRoutes);
app.register(contextRoutes);
app.register(searchRoutes);
app.register(syncRoutes);

// Ready hook
app.addHook('onReady', async () => {
  app.log.info('All plugins loaded, server ready');
});
