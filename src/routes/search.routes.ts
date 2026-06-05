import { FastifyInstance } from 'fastify';
import { postgresService } from '../services/postgres.service';
import { qdrantService } from '../services/qdrant.service';
import {
  SearchContextBodySchema,
  SearchContextBody,
  SemanticSearchBodySchema,
  SemanticSearchBody,
} from '../schemas/context.schema';
import type { ContextRecord } from '../types';

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
          filters: filters as SearchContextBody['filters'], 
          limit 
        }),
        qdrantService.semanticSearch(request.body),
      ]);

      // Merge and deduplicate by sync_id
      const seen = new Set<string>();
      const merged: Array<Record<string, unknown> & { source: string; score: number }> = [];

      // Add semantic results first (higher relevance)
      for (const result of semanticResults) {
        const r = result as unknown as Record<string, unknown>;
        const id = String(r.syncId ?? r.sync_id ?? '');
        if (id && !seen.has(id)) {
          seen.add(id);
          merged.push({
            ...result,
            source: 'semantic',
            score: (r.certainty as number) ?? (r.score as number) ?? 0,
          });
        }
      }

      // Add text search results
      for (const result of textResults) {
        const r = result as ContextRecord & { rank?: number };
        if (!seen.has(r.sync_id)) {
          seen.add(r.sync_id);
          merged.push({
            ...r,
            source: 'text',
            score: r.rank ?? 0,
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

