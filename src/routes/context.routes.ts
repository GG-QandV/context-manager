import { FastifyInstance } from 'fastify';
import { contentDetector } from '../services/contentDetector.service';
import { postgresService } from '../services/postgres.service';
import { qdrantService } from '../services/qdrant.service';
import { timeParserService } from '../services/timeParser.service';
import {
  SaveContextBodySchema,
  SaveContextBody,
  SessionIdParamSchema,
  SyncIdParamSchema,
  LogicalSectionParamSchema,
  ModuleParamSchema,
  PriorityParamSchema,
  DeploymentStageParamSchema,
  MarketPhaseParamSchema,
  OffsetParamSchema,
  PaginationQuerySchema,
  PaginationQuery,
} from '../schemas/context.schema';
import { 
  LogicalSection, 
  Module, 
  Priority, 
  DeploymentStage, 
  MarketPhase 
} from '../types';

export async function contextRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: SaveContextBody }>(
    '/api/context/save',
    {
      schema: {
        body: SaveContextBodySchema,
      },
    },
    async (request, reply) => {
      const body = request.body;
      const syncId = postgresService.generateSyncId();
      const detectedTypes = contentDetector.detectTypes(body.content || "");

      const contextData = { ...body, content_types: detectedTypes };
      const { id } = await postgresService.createContext(contextData, syncId);

      // Фоновая векторизация и синхронизация с Qdrant (не блокирует ответ API)
      (async () => {
        try {
          await qdrantService.createContext(contextData, syncId);
          await postgresService.updateSyncStatus(syncId, 'synced');
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          request.log.error({ err: errorMessage, syncId }, 'Background Qdrant sync failed');
          await postgresService.updateSyncStatus(syncId, 'failed');
        }
      })();

      return {
        success: true,
        syncId,
        id,
      };
    }
  );

  fastify.get<{
    Params: { sessionId: string };
    Querystring: PaginationQuery;
  }>(
    '/api/context/session/:sessionId',
    {
      schema: {
        params: SessionIdParamSchema,
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { sessionId } = request.params;
      const { cursor, limit } = request.query;

      const { records, hasMore, nextCursor } = await postgresService.getBySession(
        sessionId,
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.get<{ Params: { syncId: string } }>(
    '/api/context/sync/:syncId',
    {
      schema: {
        params: SyncIdParamSchema,
      },
    },
    async (request, reply) => {
      const { syncId } = request.params;
      const record = await postgresService.getBySyncId(syncId);

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
    }
  );

  fastify.get<{ Querystring: PaginationQuery }>(
    '/api/context/today',
    {
      schema: {
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { cursor, limit } = request.query;
      const { records, hasMore, nextCursor, date } = await postgresService.getByDateOffset(
        0,
        cursor,
        limit
      );

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
    }
  );

  fastify.get<{ Querystring: PaginationQuery }>(
    '/api/context/yesterday',
    {
      schema: {
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { cursor, limit } = request.query;
      const { records, hasMore, nextCursor, date } = await postgresService.getByDateOffset(
        1,
        cursor,
        limit
      );

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
    }
  );

  fastify.get<{
    Params: { offset: string };
    Querystring: PaginationQuery;
  }>(
    '/api/context/day/offset/:offset',
    {
      schema: {
        params: OffsetParamSchema,
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const offset = parseInt(request.params.offset, 10);
      const { cursor, limit } = request.query;
      
      const { records, hasMore, nextCursor, date } = await postgresService.getByDateOffset(
        offset,
        cursor,
        limit
      );

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
    }
  );

  fastify.get<{
    Params: { logicalSection: LogicalSection };
    Querystring: PaginationQuery;
  }>(
    '/api/context/section/:logicalSection',
    {
      schema: {
        params: LogicalSectionParamSchema,
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { logicalSection } = request.params;
      const { cursor, limit } = request.query;

      const { records, hasMore, nextCursor } = await postgresService.getByLogicalSection(
        logicalSection,
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.get<{
    Params: { moduleId: Module };
    Querystring: PaginationQuery;
  }>(
    '/api/context/module/:moduleId',
    {
      schema: {
        params: ModuleParamSchema,
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { moduleId } = request.params;
      const { cursor, limit } = request.query;

      const { records, hasMore, nextCursor } = await postgresService.getByModule(
        moduleId,
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.get<{
    Params: { logicalSection: LogicalSection; moduleId: Module };
    Querystring: PaginationQuery;
  }>(
    '/api/context/section/:logicalSection/module/:moduleId',
    {
      schema: {
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { logicalSection, moduleId } = request.params;
      const { cursor, limit } = request.query;

      const { records, hasMore, nextCursor } = await postgresService.getBySectionAndModule(
        logicalSection,
        moduleId,
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.get<{
    Params: { priority: Priority };
    Querystring: PaginationQuery;
  }>(
    '/api/context/priority/:priority',
    {
      schema: {
        params: PriorityParamSchema,
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { priority } = request.params;
      const { cursor, limit } = request.query;

      const { records, hasMore, nextCursor } = await postgresService.getByPriority(
        priority,
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.get<{
    Params: { stage: DeploymentStage };
    Querystring: PaginationQuery;
  }>(
    '/api/context/deployment/:stage',
    {
      schema: {
        params: DeploymentStageParamSchema,
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { stage } = request.params;
      const { cursor, limit } = request.query;

      const { records, hasMore, nextCursor } = await postgresService.getByDeploymentStage(
        stage,
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.get<{
    Params: { phase: MarketPhase };
    Querystring: PaginationQuery;
  }>(
    '/api/context/market/:phase',
    {
      schema: {
        params: MarketPhaseParamSchema,
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { phase } = request.params;
      const { cursor, limit } = request.query;

      const { records, hasMore, nextCursor } = await postgresService.getByMarketPhase(
        phase,
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.get('/api/context/marketing/summary', async () => {
    const { sections, total } = await postgresService.getMarketingSummary();

    return {
      success: true,
      results: sections,
      summary: {
        totalMarketingContexts: total,
        sections: sections.length,
      },
    };
  });

  fastify.get<{ Querystring: PaginationQuery }>(
    '/api/context/product/roadmap',
    {
      schema: {
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { cursor, limit } = request.query;
      const { records, hasMore, nextCursor } = await postgresService.getProductRoadmap(
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.get<{ Querystring: PaginationQuery }>(
    '/api/context/market/competitors',
    {
      schema: {
        querystring: PaginationQuerySchema,
      },
    },
    async (request) => {
      const { cursor, limit } = request.query;
      const { records, hasMore, nextCursor } = await postgresService.getCompetitorAnalysis(
        cursor,
        limit
      );

      return {
        success: true,
        results: records,
        pagination: {
          hasMore,
          nextCursor,
          count: records.length,
        },
      };
    }
  );

  fastify.post('/api/context/query', async (request: any, reply: any) => {
    let { date_from, date_to, level, agent, session_id, time_query } = request.body;
    
    if (time_query) {
      const parsed = timeParserService.parse(time_query);
      console.error('TIME_PARSER:', JSON.stringify({
        query: time_query,
        date_from: parsed.date_from?.toISOString(),
        date_to: parsed.date_to?.toISOString()
      }));
      date_from = date_from || parsed.date_from?.toISOString();
      date_to = date_to || parsed.date_to?.toISOString();
    }

    let query = 'SELECT id, session_id, logical_section, content_brief, content_important, content_full, created_at FROM development_context WHERE 1=1';
    const params: any[] = [];
    let idx = 1;
    if (date_from) { query += ` AND created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND created_at <= $${idx++}`; params.push(date_to); }
    if (level) { query += ` AND logical_section = $${idx++}`; params.push(level); }
    if (agent) { query += ` AND metadata->>'agent' = $${idx++}`; params.push(agent); }
    if (session_id) { query += ` AND session_id = $${idx++}`; params.push(session_id); }
    query += ' ORDER BY created_at DESC LIMIT 20';
    console.error('SQL:', query, 'PARAMS:', JSON.stringify(params));
    const result = await postgresService.executeRawQuery(query, params);
    return { success: true, results: result.rows, count: result.rowCount };
  });

  fastify.get('/api/context/config', async (request: any, reply: any) => {
    const fs = await import('fs/promises');
    try {
      const cfg = JSON.parse(await fs.readFile(`${process.env.HOME}/.iflow/context-manager-config.json`, 'utf8'));
      return { success: true, config: cfg };
    } catch { reply.code(404); return { success: false }; }
  });

  fastify.post('/api/context/config', async (request: any, reply: any) => {
    const fs = await import('fs/promises');
    const path = `${process.env.HOME}/.iflow/context-manager-config.json`;
    try {
      const cfg = JSON.parse(await fs.readFile(path, 'utf8'));
      Object.assign(cfg, request.body);
      await fs.writeFile(path, JSON.stringify(cfg, null, 2));
      return { success: true, config: cfg };
    } catch { reply.code(500); return { success: false }; }
  });
  // --- MISSING ENDPOINTS: stats, agents, export ---

  fastify.get('/api/context/stats', async (request: any) => {
    const { agent } = request.query || {};
    let query = `
      SELECT 
        COUNT(*)::int AS total,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(DISTINCT metadata->>'agent')::int AS agents,
        MIN(created_at) AS first_record,
        MAX(created_at) AS last_record
      FROM development_context WHERE 1=1
    `;
    const params: any[] = [];
    if (agent) {
      query += ` AND metadata->>'agent' = \$1`;
      params.push(agent);
    }
    const result = await postgresService.executeRawQuery(query, params);
    const row = result.rows[0] || {};

    const sectionsResult = await postgresService.executeRawQuery(
      agent
        ? `SELECT logical_section, COUNT(*)::int AS count FROM development_context WHERE metadata->>'agent' = \$1 GROUP BY logical_section ORDER BY count DESC`
        : `SELECT logical_section, COUNT(*)::int AS count FROM development_context GROUP BY logical_section ORDER BY count DESC`,
      agent ? [agent] : []
    );

    return {
      success: true,
      stats: {
        total: row.total || 0,
        sessions: row.sessions || 0,
        agents: row.agents || 0,
        first_record: row.first_record,
        last_record: row.last_record,
        by_section: sectionsResult.rows,
      },
    };
  });

  fastify.get('/api/context/agents', async () => {
    const result = await postgresService.executeRawQuery(
      `SELECT 
        metadata->>'agent' AS agent,
        COUNT(*)::int AS records,
        MAX(created_at) AS last_active
      FROM development_context
      WHERE metadata->>'agent' IS NOT NULL
      GROUP BY metadata->>'agent'
      ORDER BY last_active DESC`,
      []
    );

    return {
      success: true,
      agents: result.rows,
      count: result.rowCount,
    };
  });

  fastify.get('/api/context/export', async (request: any) => {
    const { session, agent, limit } = request.query || {};
    let query = `SELECT id, session_id, logical_section, content_brief, content_important, content_full, metadata, created_at FROM development_context WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (session) { query += ' AND session_id = $' + idx; params.push(session); idx++; }
    if (agent) { query += " AND metadata->>'agent' = $" + idx; params.push(agent); idx++; }
    query += ' ORDER BY created_at DESC LIMIT $' + idx;
    params.push(parseInt(limit) || 100);

    const result = await postgresService.executeRawQuery(query, params);
    return {
      success: true,
      results: result.rows,
      count: result.rowCount,
    };
  });

}
