export interface Config {
  port: number;
  host: string;
  database: {
    url: string;
    poolSize: number;
    idleTimeout: number;
  };
  // ЗАМЕНА: Weaviate на Qdrant
  qdrant: {
    host: string;
    port: number;
  };
  // ДОБАВЛЕНО: HuggingFace TEI
  tei: {
    url: string;
  };
  embedding: {
    provider: 'openai' | 'huggingface-tei' | 'none'; // Добавлен новый провайдер
    openaiApiKey?: string;
    model: string;
    dimensions: number;
  };
  sync: {
    batchSize: number;
    intervalMs: number;
  };
}

function loadConfig(): Config {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const embeddingProvider = (process.env.EMBEDDING_PROVIDER as 'openai' | 'huggingface-tei' | 'none') || 'huggingface-tei';
  
  if (embeddingProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when using OpenAI embeddings');
  }

  return {
    port: parseInt(process.env.PORT || '3847', 10), // Обновил дефолтный порт на ваш 3847
    host: process.env.HOST || '0.0.0.0',
    
    database: {
      url: databaseUrl,
      poolSize: parseInt(process.env.DB_POOL_SIZE || '20', 10),
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    },
    
    // Новая секция Qdrant
    qdrant: {
      host: process.env.QDRANT_HOST || 'qdrant-new',
      port: parseInt(process.env.QDRANT_PORT || '6333', 10),
    },

    // Новая секция TEI
    tei: {
      url: process.env.TEI_HOST || 'http://tei-embeddings:80',
    },
    
    embedding: {
      provider: embeddingProvider,
      openaiApiKey: process.env.OPENAI_API_KEY,
      model: process.env.EMBEDDING_MODEL || 'multilingual-e5-small',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384', 10), // E5-Small использует 384
    },
    
    sync: {
      batchSize: parseInt(process.env.SYNC_BATCH_SIZE || '100', 10),
      intervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10),
    },
  };
}

export const config = loadConfig();

