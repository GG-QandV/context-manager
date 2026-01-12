"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextRoutes = contextRoutes;
const postgres_service_1 = require("../services/postgres.service");
const qdrant_service_1 = require("../services/qdrant.service");
const context_schema_1 = require("../schemas/context.schema"); // Убедитесь, что тут стоит };
async function contextRoutes(fastify) {
    // Save context
    fastify.post('/api/context/save', {
        schema: {
            body: context_schema_1.SaveContextBodySchema,
        },
    }, async (request, reply) => {
        const body = request.body;
        const syncId = postgres_service_1.postgresService.generateSyncId();
        // Save to PostgreSQL first
        const { id } = await postgres_service_1.postgresService.createContext(body, syncId);
        // ЗАМЕНА ТУТ (теперь синхронизируем с Qdrant):
        try {
            await qdrant_service_1.qdrantService.createContext(body, syncId);
            await postgres_service_1.postgresService.updateSyncStatus(syncId, 'synced');
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            request.log.error({ err: errorMessage }, 'Qdrant sync failed');
            await postgres_service_1.postgresService.updateSyncStatus(syncId, 'failed');
        }
        return {
            success: true,
            syncId,
            id,
        };
    });
    // Get session context
    fastify.get('/api/context/session/:sessionId', {
        schema: {
            params: context_schema_1.SessionIdParamSchema,
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { sessionId } = request.params;
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getBySession(sessionId, cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get by sync ID
    fastify.get('/api/context/sync/:syncId', {
        schema: {
            params: context_schema_1.SyncIdParamSchema,
        },
    }, async (request, reply) => {
        const { syncId } = request.params;
        const record = await postgres_service_1.postgresService.getBySyncId(syncId);
        if (!record) {
            reply.code(404);
            return {
                success: false,
                error: 'Context not found',
            };
        }
        return {
            success: true,
            result: record,
        };
    });
    // Get today's contexts
    fastify.get('/api/context/today', {
        schema: {
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor, date } = await postgres_service_1.postgresService.getByDateOffset(0, cursor, limit);
        return {
            success: true,
            results: records,
            date,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get yesterday's contexts
    fastify.get('/api/context/yesterday', {
        schema: {
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor, date } = await postgres_service_1.postgresService.getByDateOffset(1, cursor, limit);
        return {
            success: true,
            results: records,
            date,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get by date offset
    fastify.get('/api/context/day/offset/:offset', {
        schema: {
            params: context_schema_1.OffsetParamSchema,
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const offset = parseInt(request.params.offset, 10);
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor, date } = await postgres_service_1.postgresService.getByDateOffset(offset, cursor, limit);
        return {
            success: true,
            results: records,
            date,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get by logical section
    fastify.get('/api/context/section/:logicalSection', {
        schema: {
            params: context_schema_1.LogicalSectionParamSchema,
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { logicalSection } = request.params;
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getByLogicalSection(logicalSection, cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get by module
    fastify.get('/api/context/module/:moduleId', {
        schema: {
            params: context_schema_1.ModuleParamSchema,
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { moduleId } = request.params;
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getByModule(moduleId, cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get by section and module
    fastify.get('/api/context/section/:logicalSection/module/:moduleId', {
        schema: {
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { logicalSection, moduleId } = request.params;
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getBySectionAndModule(logicalSection, moduleId, cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get by priority
    fastify.get('/api/context/priority/:priority', {
        schema: {
            params: context_schema_1.PriorityParamSchema,
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { priority } = request.params;
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getByPriority(priority, cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get by deployment stage
    fastify.get('/api/context/deployment/:stage', {
        schema: {
            params: context_schema_1.DeploymentStageParamSchema,
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { stage } = request.params;
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getByDeploymentStage(stage, cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Get by market phase
    fastify.get('/api/context/market/:phase', {
        schema: {
            params: context_schema_1.MarketPhaseParamSchema,
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { phase } = request.params;
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getByMarketPhase(phase, cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Marketing summary
    fastify.get('/api/context/marketing/summary', async () => {
        const { sections, total } = await postgres_service_1.postgresService.getMarketingSummary();
        return {
            success: true,
            results: sections,
            summary: {
                totalMarketingContexts: total,
                sections: sections.length,
            },
        };
    });
    // Product roadmap
    fastify.get('/api/context/product/roadmap', {
        schema: {
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getProductRoadmap(cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Competitor analysis
    fastify.get('/api/context/market/competitors', {
        schema: {
            querystring: context_schema_1.PaginationQuerySchema,
        },
    }, async (request) => {
        const { cursor, limit } = request.query;
        const { records, hasMore, nextCursor } = await postgres_service_1.postgresService.getCompetitorAnalysis(cursor, limit);
        return {
            success: true,
            results: records,
            pagination: {
                hasMore,
                nextCursor,
                count: records.length,
            },
        };
    });
    // Query context by filters  
    fastify.post('/api/context/query', async (request, reply) => {
        const { date_from, date_to, level, agent, session_id } = request.body;
        let query = 'SELECT id, session_id, logical_section, content_brief, content_important, content_full, created_at FROM development_context WHERE 1=1';
        const params = [];
        let idx = 1;
        if (date_from) {
            query += ` AND created_at >= $${idx++}`;
            params.push(date_from);
        }
        if (date_to) {
            query += ` AND created_at <= $${idx++}`;
            params.push(date_to);
        }
        if (level) {
            query += ` AND logical_section = $${idx++}`;
            params.push(level);
        }
        if (agent) {
            query += ` AND metadata->>'agent' = $${idx++}`;
            params.push(agent);
        }
        if (session_id) {
            query += ` AND session_id = $${idx++}`;
            params.push(session_id);
        }
        query += ' ORDER BY created_at DESC LIMIT 20';
        const result = await postgres_service_1.postgresService.executeRawQuery(query, params);
        return { success: true, results: result.rows, count: result.rowCount };
    });
    fastify.get('/api/context/config', async (request, reply) => {
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        try {
            const cfg = JSON.parse(await fs.readFile(`${process.env.HOME}/.iflow/context-manager-config.json`, 'utf8'));
            return { success: true, config: cfg };
        }
        catch {
            reply.code(404);
            return { success: false };
        }
    });
    fastify.post('/api/context/config', async (request, reply) => {
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const path = `${process.env.HOME}/.iflow/context-manager-config.json`;
        try {
            const cfg = JSON.parse(await fs.readFile(path, 'utf8'));
            Object.assign(cfg, request.body);
            await fs.writeFile(path, JSON.stringify(cfg, null, 2));
            return { success: true, config: cfg };
        }
        catch {
            reply.code(500);
            return { success: false };
        }
    });
}
//# sourceMappingURL=context.routes.js.map