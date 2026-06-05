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

// SSE endpoint для MCP
app.get("/", async (req, reply) => {
  reply.header("Content-Type", "text/event-stream");
  reply.header("Cache-Control", "no-cache");
  reply.header("Connection", "keep-alive");
  reply.header("Access-Control-Allow-Origin", "*");
  
  reply.raw.write("data: {\"type\":\"connected\",\"message\":\"MCP SSE ready\"}\n\n");
  
  req.raw.socket.setTimeout(Number.MAX_SAFE_INTEGER);
  
  const interval = setInterval(() => {
    reply.raw.write("data: {\"type\":\"ping\",\"timestamp\":" + Date.now() + "}\n\n");
  }, 30000);
  
  req.raw.on("close", () => {
    clearInterval(interval);
    req.raw.destroy();
  });
});

// MCP initialize endpoint (POST /mcp)
app.post("/mcp", async (req, reply) => {
  const body = req.body as any;
  if (body.method === "initialize") {
    return reply.send({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          resources: ["filesystem", "diagnostics"]
        },
        serverInfo: {
          name: "context-manager",
          version: "2.2.1"
        }
      }
    });
  }
  return reply.status(404).send({ error: "Method not found" });
});

// Ready hook
app.addHook('onReady', async () => {
  app.log.info('All plugins loaded, server ready');
});
