"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const health_routes_1 = require("./routes/health.routes");
const context_routes_1 = require("./routes/context.routes");
const search_routes_1 = require("./routes/search.routes");
const sync_routes_1 = require("./routes/sync.routes");
const error_handler_1 = require("./middleware/error-handler");
const isDev = process.env.NODE_ENV === 'development';
exports.app = (0, fastify_1.default)({
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
exports.app.register(cors_1.default, {
    origin: process.env.CORS_ORIGIN || true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
});
// Global error handler
exports.app.setErrorHandler(error_handler_1.errorHandler);
// Register routes
exports.app.register(health_routes_1.healthRoutes);
exports.app.register(context_routes_1.contextRoutes);
exports.app.register(search_routes_1.searchRoutes);
exports.app.register(sync_routes_1.syncRoutes);
// Ready hook
exports.app.addHook('onReady', async () => {
    exports.app.log.info('All plugins loaded, server ready');
});
//# sourceMappingURL=app.js.map