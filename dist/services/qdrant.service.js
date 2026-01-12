"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.qdrantService = void 0;
const js_client_rest_1 = require("@qdrant/js-client-rest");
const config_1 = require("../config");
const embedding_service_1 = require("./embedding.service");
const crypto_1 = __importDefault(require("crypto"));
class QdrantService {
    client;
    collectionName = 'DevelopmentContext';
    constructor() {
        this.client = new js_client_rest_1.QdrantClient({
            host: config_1.config.qdrant.host,
            port: config_1.config.qdrant.port,
        });
    }
    async healthCheck() {
        try {
            const result = await this.client.getCollections();
            return !!result;
        }
        catch {
            return false;
        }
    }
    // В Qdrant инициализация коллекции (аналог класса в Weaviate)
    async initializeSchema() {
        try {
            const collections = await this.client.getCollections();
            const exists = collections.collections.some(c => c.name === this.collectionName);
            if (!exists) {
                console.log(`Creating Qdrant collection: ${this.collectionName}`);
                await this.client.createCollection(this.collectionName, {
                    vectors: {
                        size: config_1.config.embedding.dimensions,
                        distance: 'Cosine'
                    }
                });
                console.log(`Qdrant collection ${this.collectionName} created successfully`);
            }
        }
        catch (error) {
            console.error('Failed to initialize Qdrant collection:', error);
            throw error;
        }
    }
    async createContext(data, syncId) {
        // 1. Используем новый метод чанкинга (Chunking + Overlap)
        const chunks = await embedding_service_1.embeddingService.getChunksAndEmbeddings(data.content);
        // 2. Генерируем краткое резюме для метаданных
        const summary = data.summary ||
            data.content.substring(0, 200) + (data.content.length > 200 ? '...' : '');
        // 3. Формируем точки для Qdrant
        const points = chunks.map((chunk, index) => ({
            id: crypto_1.default.randomUUID(),
            vector: chunk.vector,
            payload: {
                sessionId: data.sessionId,
                contextType: data.contextType,
                content: chunk.text, // Теперь тут кусок текста
                originalContent: data.content, // Храним оригинал для справки
                summary,
                tags: data.tags || [],
                timestamp: new Date().toISOString(),
                projectId: data.projectId || 'default',
                syncId,
                logicalSection: data.logicalSection || null,
                module: data.module || null,
                techTags: data.techTags || [],
                phase: data.phase || null,
                priority: data.priority || null,
                deploymentStage: data.deploymentStage || null,
                marketPhase: data.marketPhase || null,
                chunkIndex: index
            }
        }));
        await this.client.upsert(this.collectionName, {
            wait: true,
            points
        });
    }
    async batchCreateContexts(records) {
        const successful = [];
        const failed = [];
        // Обрабатываем по одному, так как каждый рекорд порождает несколько чанков
        for (const record of records) {
            try {
                const body = {
                    sessionId: record.session_id,
                    contextType: record.context_type,
                    content: record.content,
                    summary: record.summary,
                    tags: record.tags,
                    projectId: record.project_id,
                    logicalSection: record.logical_section ?? undefined,
                    module: record.module ?? undefined,
                    techTags: record.tech_tags ?? undefined,
                    phase: record.phase ?? undefined,
                    priority: record.priority ?? undefined,
                    deploymentStage: record.deployment_stage ?? undefined,
                    marketPhase: record.market_phase ?? undefined,
                };
                await this.createContext(body, record.sync_id);
                successful.push(record.sync_id);
            }
            catch (error) {
                console.error(`Failed to sync ${record.sync_id}:`, error);
                failed.push(record.sync_id);
            }
        }
        return { successful, failed };
    }
    async semanticSearch(params) {
        const { query, filters, limit = 10 } = params;
        const queryVector = await embedding_service_1.embeddingService.getEmbedding(query);
        // Подготовка фильтров Qdrant
        const mustFilters = [];
        if (filters?.logicalSection)
            mustFilters.push({ key: 'logicalSection', match: { value: filters.logicalSection } });
        if (filters?.module)
            mustFilters.push({ key: 'module', match: { value: filters.module } });
        if (filters?.projectId)
            mustFilters.push({ key: 'projectId', match: { value: filters.projectId } });
        const results = await this.client.search(this.collectionName, {
            vector: queryVector,
            filter: mustFilters.length > 0 ? { must: mustFilters } : undefined,
            limit: Math.min(limit, 100),
            with_payload: true
        });
        return results.map(hit => {
            const p = hit.payload;
            return {
                sessionId: p?.sessionId || '',
                contextType: p?.contextType || '',
                content: p?.text || p?.content || '',
                summary: p?.summary || '',
                tags: p?.tags || [],
                timestamp: p?.timestamp || '',
                projectId: p?.projectId || '',
                syncId: p?.syncId || '',
                logicalSection: p?.logicalSection ?? undefined,
                module: p?.module ?? undefined,
                techTags: p?.techTags || [],
                phase: p?.phase ?? undefined,
                priority: p?.priority ?? undefined,
                deploymentStage: p?.deploymentStage ?? undefined,
                marketPhase: p?.marketPhase ?? undefined,
                certainty: (hit.score + 1) / 2,
                score: hit.score
            };
        });
    }
}
exports.qdrantService = new QdrantService();
//# sourceMappingURL=qdrant.service.js.map