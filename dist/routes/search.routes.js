"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchRoutes = searchRoutes;
const postgres_service_1 = require("../services/postgres.service");
// ЗАМЕНА ТУТ:
const qdrant_service_1 = require("../services/qdrant.service");
const context_schema_1 = require("../schemas/context.schema");
async function searchRoutes(fastify) {
    // Full-text search (PostgreSQL)
    fastify.post('/api/context/search', {
        schema: {
            body: context_schema_1.SearchContextBodySchema,
        },
    }, async (request) => {
        const results = await postgres_service_1.postgresService.searchContexts(request.body);
        return {
            success: true,
            results,
            count: results.length,
        };
    });
    // Semantic search (ЗАМЕНЕНО: Qdrant вместо Weaviate)
    fastify.post('/api/context/semantic-search', {
        schema: {
            body: context_schema_1.SemanticSearchBodySchema,
        },
    }, async (request) => {
        // ЗАМЕНА ТУТ:
        const results = await qdrant_service_1.qdrantService.semanticSearch(request.body);
        return {
            success: true,
            results,
            count: results.length,
        };
    });
    // Hybrid search (PostgreSQL + ЗАМЕНЕНО: Qdrant)
    fastify.post('/api/context/hybrid-search', {
        schema: {
            body: context_schema_1.SemanticSearchBodySchema,
        },
    }, async (request) => {
        const { query, filters, limit = 10 } = request.body;
        // Run both searches in parallel
        const [textResults, semanticResults] = await Promise.all([
            postgres_service_1.postgresService.searchContexts({
                query,
                filters: filters,
                limit
            }),
            // ЗАМЕНА ТУТ:
            qdrant_service_1.qdrantService.semanticSearch(request.body),
        ]);
        // Merge and deduplicate by sync_id
        const seen = new Set();
        const merged = [];
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
                    score: result.rank || 0,
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
    });
}
//# sourceMappingURL=search.routes.js.map