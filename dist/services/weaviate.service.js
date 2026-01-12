"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.weaviateService = exports.WeaviateService = void 0;
const weaviate_ts_client_1 = __importDefault(require("weaviate-ts-client"));
const config_1 = require("../config");
const embedding_service_1 = require("./embedding.service");
class WeaviateService {
    client;
    maxRetries;
    retryDelay;
    className = 'DevelopmentContext';
    constructor() {
        this.client = weaviate_ts_client_1.default.client({
            scheme: config_1.config.weaviate.scheme,
            host: config_1.config.weaviate.host,
            // Убрали headers - клиент сам добавляет Content-Type
        });
        this.maxRetries = config_1.config.weaviate.retryAttempts;
        this.retryDelay = config_1.config.weaviate.retryDelay;
    }
    async healthCheck() {
        try {
            const schema = await this.client.schema.getter().do();
            return !!schema;
        }
        catch {
            return false;
        }
    }
    async withRetry(operation) {
        let lastError = new Error('Unknown error');
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(`Weaviate operation failed (attempt ${attempt + 1}/${this.maxRetries}):`, lastError.message);
                if (attempt < this.maxRetries - 1) {
                    await new Promise(r => setTimeout(r, this.retryDelay * (attempt + 1)));
                }
            }
        }
        throw lastError;
    }
    async createContext(data, syncId) {
        const summary = data.summary ||
            data.content.substring(0, 200) + (data.content.length > 200 ? '...' : '');
        const textForEmbedding = `${data.contextType}: ${data.content}`;
        const vector = await embedding_service_1.embeddingService.getEmbedding(textForEmbedding);
        const properties = {
            sessionId: data.sessionId,
            contextType: data.contextType,
            content: data.content,
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
        };
        await this.withRetry(async () => {
            const creator = this.client.data.creator()
                .withClassName(this.className)
                .withProperties(properties);
            if (vector.some(v => v !== 0)) {
                creator.withVector(vector);
            }
            await creator.do();
        });
    }
    async batchCreateContexts(records) {
        if (records.length === 0) {
            return { successful: [], failed: [] };
        }
        const successful = [];
        const failed = [];
        const batchSize = 50;
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            try {
                const batcher = this.client.batch.objectsBatcher();
                for (const record of batch) {
                    const textForEmbedding = `${record.context_type}: ${record.content}`;
                    const vector = await embedding_service_1.embeddingService.getEmbedding(textForEmbedding);
                    const objectData = {
                        class: this.className,
                        properties: {
                            sessionId: record.session_id,
                            contextType: record.context_type,
                            content: record.content,
                            summary: record.summary,
                            tags: record.tags,
                            timestamp: record.created_at.toISOString(),
                            projectId: record.project_id,
                            syncId: record.sync_id,
                            logicalSection: record.logical_section,
                            module: record.module,
                            techTags: record.tech_tags,
                            phase: record.phase,
                            priority: record.priority,
                            deploymentStage: record.deployment_stage,
                            marketPhase: record.market_phase,
                        },
                    };
                    if (vector.some(v => v !== 0)) {
                        objectData.vector = vector;
                    }
                    batcher.withObject(objectData);
                }
                const results = await this.withRetry(() => batcher.do());
                for (let j = 0; j < results.length; j++) {
                    const item = results[j];
                    const record = batch[j];
                    if (item.result?.errors && item.result.errors.length > 0) {
                        console.error(`Failed to sync ${record.sync_id}:`, item.result.errors);
                        failed.push(record.sync_id);
                    }
                    else {
                        successful.push(record.sync_id);
                    }
                }
            }
            catch (error) {
                console.error('Batch sync failed:', error);
                failed.push(...batch.map(r => r.sync_id));
            }
        }
        return { successful, failed };
    }
    async semanticSearch(params) {
        const { query, filters, limit = 10, certaintyThreshold = 0.7 } = params;
        const queryVector = await embedding_service_1.embeddingService.getEmbedding(query);
        let graphqlQuery = this.client.graphql
            .get()
            .withClassName(this.className)
            .withFields('sessionId contextType content summary tags timestamp projectId syncId ' +
            'logicalSection module techTags phase priority deploymentStage marketPhase ' +
            '_additional { certainty }')
            .withNearVector({
            vector: queryVector,
            certainty: certaintyThreshold
        })
            .withLimit(Math.min(limit, 100));
        if (filters) {
            const whereOperands = [];
            if (filters.logicalSection) {
                whereOperands.push({
                    path: ['logicalSection'],
                    operator: 'Equal',
                    valueText: filters.logicalSection,
                });
            }
            if (filters.module) {
                whereOperands.push({
                    path: ['module'],
                    operator: 'Equal',
                    valueText: filters.module,
                });
            }
            if (filters.projectId) {
                whereOperands.push({
                    path: ['projectId'],
                    operator: 'Equal',
                    valueText: filters.projectId,
                });
            }
            if (whereOperands.length > 0) {
                const whereFilter = whereOperands.length === 1
                    ? whereOperands[0]
                    : { operator: 'And', operands: whereOperands };
                graphqlQuery = graphqlQuery.withWhere(whereFilter);
            }
        }
        const result = await this.withRetry(() => graphqlQuery.do());
        const items = result.data?.Get?.[this.className] || [];
        return items.map((item) => ({
            sessionId: item.sessionId || '',
            contextType: item.contextType || '',
            content: item.content || '',
            summary: item.summary || '',
            tags: item.tags || [],
            timestamp: item.timestamp || '',
            projectId: item.projectId || '',
            syncId: item.syncId || '',
            logicalSection: item.logicalSection || null,
            module: item.module || null,
            techTags: item.techTags || [],
            phase: item.phase || null,
            priority: item.priority || null,
            deploymentStage: item.deploymentStage || null,
            marketPhase: item.marketPhase || null,
            certainty: item._additional?.certainty || 0,
        }));
    }
    async initializeSchema() {
        try {
            const schema = await this.client.schema.getter().do();
            const classExists = schema.classes?.some(c => c.class === this.className);
            if (!classExists) {
                console.log(`Creating Weaviate class: ${this.className}`);
                await this.client.schema.classCreator().withClass({
                    class: this.className,
                    vectorizer: config_1.config.embedding.provider === 'none' ? 'text2vec-transformers' : 'none',
                    properties: [
                        { name: 'sessionId', dataType: ['text'] },
                        { name: 'contextType', dataType: ['text'] },
                        { name: 'content', dataType: ['text'] },
                        { name: 'summary', dataType: ['text'] },
                        { name: 'tags', dataType: ['text[]'] },
                        { name: 'timestamp', dataType: ['date'] },
                        { name: 'projectId', dataType: ['text'] },
                        { name: 'syncId', dataType: ['text'] },
                        { name: 'logicalSection', dataType: ['text'] },
                        { name: 'module', dataType: ['text'] },
                        { name: 'techTags', dataType: ['text[]'] },
                        { name: 'phase', dataType: ['text'] },
                        { name: 'priority', dataType: ['text'] },
                        { name: 'deploymentStage', dataType: ['text'] },
                        { name: 'marketPhase', dataType: ['text'] },
                    ],
                }).do();
                console.log(`Weaviate class ${this.className} created successfully`);
            }
        }
        catch (error) {
            console.error('Failed to initialize Weaviate schema:', error);
            throw error;
        }
    }
}
exports.WeaviateService = WeaviateService;
exports.weaviateService = new WeaviateService();
//# sourceMappingURL=weaviate.service.js.map