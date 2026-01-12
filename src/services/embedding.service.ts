import { config } from '../config';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import axios from 'axios';

export interface ChunkedEmbedding {
  text: string;
  vector: number[];
}

export interface EmbeddingService {
  getEmbedding(text: string): Promise<number[]>;
  // Новый метод для работы с длинными текстами (Чанкинг + Overlap)
  getChunksAndEmbeddings(text: string): Promise<ChunkedEmbedding[]>;
  getDimensions(): number;
}

class HuggingFaceTEIService implements EmbeddingService {
  private url: string;
  private dimensions: number;
  private splitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.url = config.tei.url;
    this.dimensions = config.embedding.dimensions;
    // Настройка чанкинга
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 400,     // ~200 слов RU
      chunkOverlap: 80,  // ~35 слов перекрытия
    });
  }

  async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.url}/embed`, {
        inputs: text
      });
      return response.data[0];
    } catch (error: any) {
      throw new Error(`HuggingFace TEI error: ${error.message}`);
    }
  }

  async getChunksAndEmbeddings(text: string): Promise<ChunkedEmbedding[]> {
    // 1. Нарезаем текст на куски с перекрытием
    const chunks = await this.splitter.splitText(text);
    
    // 2. Векторизуем каждый кусок (параллельно через Promise.all)
    return await Promise.all(
      chunks.map(async (chunk) => ({
        text: chunk,
        vector: await this.getEmbedding(chunk)
      }))
    );
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

class OpenAIEmbeddingService implements EmbeddingService {
  private apiKey: string;
  private model: string;
  private dimensions: number;

  constructor() {
    this.apiKey = config.embedding.openaiApiKey!;
    this.model = config.embedding.model;
    this.dimensions = config.embedding.dimensions;
  }

  async getEmbedding(text: string): Promise<number[]> {
    const response = await axios.post('https://api.openai.com/v1/embeddings', {
      model: this.model,
      input: text.slice(0, 8000),
      dimensions: this.dimensions,
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      }
    });

    return response.data.data[0].embedding;
  }

  async getChunksAndEmbeddings(text: string): Promise<ChunkedEmbedding[]> {
    // Для OpenAI тоже можно добавить чанкинг, если нужно
    const vector = await this.getEmbedding(text);
    return [{ text, vector }];
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

class NoOpEmbeddingService implements EmbeddingService {
  private dimensions: number;

  constructor() {
    this.dimensions = config.embedding.dimensions;
  }

  async getEmbedding(_text: string): Promise<number[]> {
    return Array(this.dimensions).fill(0);
  }

  async getChunksAndEmbeddings(text: string): Promise<ChunkedEmbedding[]> {
    return [{ text, vector: await this.getEmbedding(text) }];
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

function createEmbeddingService(): EmbeddingService {
  switch (config.embedding.provider) {
    case 'huggingface-tei':
      return new HuggingFaceTEIService();
    case 'openai':
      return new OpenAIEmbeddingService();
    case 'none':
    default:
      return new NoOpEmbeddingService();
  }
}

export const embeddingService = createEmbeddingService();

