import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config';
import { embeddingService } from './embedding.service';
import { ContextRecord } from '../types';
import { SaveContextBody, SemanticSearchBody } from '../schemas/context.schema';
import crypto from 'crypto';

class QdrantService {
  private client: QdrantClient;
  private collectionName = 'DevelopmentContext';

  constructor() {
    this.client = new QdrantClient({
      host: config.qdrant.host,
      port: config.qdrant.port,
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.getCollections();
      return !!result;
    } catch {
      return false;
    }
  }

  // В Qdrant инициализация коллекции (аналог класса в Weaviate)
  async initializeSchema(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (!exists) {
        console.log(`Creating Qdrant collection: ${this.collectionName}`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: config.embedding.dimensions,
            distance: 'Cosine'
          }
        });
        console.log(`Qdrant collection ${this.collectionName} created successfully`);
      }
    } catch (error) {
      console.error('Failed to initialize Qdrant collection:', error);
      throw error;
    }
  }

  async createContext(data: SaveContextBody, syncId: string): Promise<void> {
    // 1. Используем новый метод чанкинга (Chunking + Overlap)
    const chunks = await embeddingService.getChunksAndEmbeddings(data.content);
    
    // 2. Генерируем краткое резюме для метаданных
    const summary = data.summary || 
      data.content.substring(0, 200) + (data.content.length > 200 ? '...' : '');

    // 3. Формируем точки для Qdrant
    const points = chunks.map((chunk, index) => ({
      id: crypto.randomUUID(),
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

  async batchCreateContexts(records: ContextRecord[]): Promise<{ successful: string[]; failed: string[] }> {
    const successful: string[] = [];
    const failed: string[] = [];

    // Обрабатываем по одному, так как каждый рекорд порождает несколько чанков
    for (const record of records) {
      try {
        const body: SaveContextBody = {
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
      } catch (error) {
        console.error(`Failed to sync ${record.sync_id}:`, error);
        failed.push(record.sync_id);
      }
    }

    return { successful, failed };
  }

  async semanticSearch(params: SemanticSearchBody): Promise<any[]> {
    const { query, filters, limit = 10 } = params;

    const queryVector = await embeddingService.getEmbedding(query);

    // Подготовка фильтров Qdrant
    const mustFilters: any[] = [];
    if (filters?.logicalSection) mustFilters.push({ key: 'logicalSection', match: { value: filters.logicalSection } });
    if (filters?.module) mustFilters.push({ key: 'module', match: { value: filters.module } });
    if (filters?.projectId) mustFilters.push({ key: 'projectId', match: { value: filters.projectId } });

    const results = await this.client.search(this.collectionName, {
      vector: queryVector,
      filter: mustFilters.length > 0 ? { must: mustFilters } : undefined,
      limit: Math.min(limit, 100),
      with_payload: true
    });

    return results.map(hit => {
      const p = hit.payload as any;
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

export const qdrantService = new QdrantService();

