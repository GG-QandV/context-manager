import { config } from '../config';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import axios from 'axios';

export interface ChunkedEmbedding {
  text: string;
  vector: number[];
}

export interface EmbeddingService {
  getEmbedding(text: string): Promise<number[]>;
  /**
   * Batch embed multiple texts in a single HTTP call.
   * Returns vectors in the same order as inputs.
   * Falls back to sequential getEmbedding() when batch is unavailable.
   */
  getEmbeddingBatch(texts: string[]): Promise<number[][]>;
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

  /**
   * Single HTTP call for N texts: POST /embed {inputs: [t1, t2, ...]}
   * TEI/ONNX embedder returns [[vec1], [vec2], ...] — same order as inputs.
   * Expected latency: ~same as single call, regardless of batch size (~20–50ms).
   */
  async getEmbeddingBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    try {
      const response = await axios.post(`${this.url}/embed`, {
        inputs: texts
      });
      return response.data as number[][];
    } catch (error: any) {
      throw new Error(`HuggingFace TEI batch error: ${error.message}`);
    }
  }

  async getChunksAndEmbeddings(text: string): Promise<ChunkedEmbedding[]> {
    // 1. Нарезаем текст на куски с перекрытием
    const chunks = await this.splitter.splitText(text);
    if (chunks.length === 0) return [];

    // 2. Один batch-запрос вместо N параллельных HTTP вызовов
    const vectors = await this.getEmbeddingBatch(chunks);

    return chunks.map((chunk, i) => ({
      text: chunk,
      vector: vectors[i],
    }));
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

  /**
   * OpenAI supports batch via input:[...] but uses a different response shape.
   * Sequential fallback used here — OpenAI is not the Windows-native path.
   */
  async getEmbeddingBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.getEmbedding(t)));
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

  async getEmbeddingBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => Array(this.dimensions).fill(0));
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

