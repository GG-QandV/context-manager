import { FastifyInstance } from 'fastify';
import { postgresService } from '../services/postgres.service';
// ЗАМЕНА ТУТ:
import { qdrantService } from '../services/qdrant.service';
import {
  SearchContextBodySchema,
  SearchContextBody,
  SemanticSearchBodySchema,
  SemanticSearchBody,
} from '../schemas/context.schema';

export async function searchRoutes(fastify: FastifyInstance) {
  // Full-text search (PostgreSQL)
  fastify.post<{ Body: SearchContextBody }>(
    '/api/context/search',
    {
      schema: {
        body: SearchContextBodySchema,
      },
    },
    async (request) => {
      const results = await postgresService.searchContexts(request.body);

      return {
        success: true,
        results,
        count: results.length,
      };
    }
  );

  // Semantic search (ЗАМЕНЕНО: Qdrant вместо Weaviate)
  fastify.post<{ Body: SemanticSearchBody }>(
    '/api/context/semantic-search',
    {
      schema: {
        body: SemanticSearchBodySchema,
      },
    },
    async (request) => {
      // ЗАМЕНА ТУТ:
      const results = await qdrantService.semanticSearch(request.body);

      return {
        success: true,
        results,
        count: results.length,
      };
    }
  );

  // Hybrid search (PostgreSQL + ЗАМЕНЕНО: Qdrant)
  fastify.post<{ Body: SemanticSearchBody }>(
    '/api/context/hybrid-search',
    {
      schema: {
        body: SemanticSearchBodySchema,
      },
    },
    async (request) => {
      const { query, filters, limit = 10 } = request.body;

      // Run both searches in parallel
      const [textResults, semanticResults] = await Promise.all([
        postgresService.searchContexts({ 
          query, 
          filters: filters as any, 
          limit 
        }),
        // ЗАМЕНА ТУТ:
        qdrantService.semanticSearch(request.body),
      ]);

      // Merge and deduplicate by sync_id
      const seen = new Set<string>();
      const merged: any[] = [];

      // Add semantic results first (higher relevance)
      for (const result of semanticResults) {
        // У Qdrant результат может быть в camelCase (syncId) или snake_case (sync_id)
        // В нашем qdrant.service.ts мы мапим это в syncId
        const id = result.syncId || result.sync_id;
        if (id && !seen.has(id)) {
          seen.add(id);
          merged.push({
            ...result,
            source: 'semantic',
            score: result.certainty || result.score,
          });
        }
      }

      // Add text search results
      for (const result of textResults) {
        if (!seen.has(result.sync_id)) {
          seen.add(result.sync_id);
          merged.push({
            ...result,
            source: 'text',
            score: (result as any).rank || 0,
          });
        }
      }

      return {
        success: true,
        results: merged.slice(0, limit),
        count: merged.length,
        sources: {
          semantic: semanticResults.length,
          text: textResults.length,
        },
      };
    }
  );
}

