"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.embeddingService = void 0;
const config_1 = require("../config");
const textsplitters_1 = require("@langchain/textsplitters");
const axios_1 = __importDefault(require("axios"));
class HuggingFaceTEIService {
    url;
    dimensions;
    splitter;
    constructor() {
        this.url = config_1.config.tei.url;
        this.dimensions = config_1.config.embedding.dimensions;
        // Настройка чанкинга
        this.splitter = new textsplitters_1.RecursiveCharacterTextSplitter({
            chunkSize: 400, // ~200 слов RU
            chunkOverlap: 80, // ~35 слов перекрытия
        });
    }
    async getEmbedding(text) {
        try {
            const response = await axios_1.default.post(`${this.url}/embed`, {
                inputs: text
            });
            return response.data[0];
        }
        catch (error) {
            throw new Error(`HuggingFace TEI error: ${error.message}`);
        }
    }
    async getChunksAndEmbeddings(text) {
        // 1. Нарезаем текст на куски с перекрытием
        const chunks = await this.splitter.splitText(text);
        // 2. Векторизуем каждый кусок (параллельно через Promise.all)
        return await Promise.all(chunks.map(async (chunk) => ({
            text: chunk,
            vector: await this.getEmbedding(chunk)
        })));
    }
    getDimensions() {
        return this.dimensions;
    }
}
class OpenAIEmbeddingService {
    apiKey;
    model;
    dimensions;
    constructor() {
        this.apiKey = config_1.config.embedding.openaiApiKey;
        this.model = config_1.config.embedding.model;
        this.dimensions = config_1.config.embedding.dimensions;
    }
    async getEmbedding(text) {
        const response = await axios_1.default.post('https://api.openai.com/v1/embeddings', {
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
    async getChunksAndEmbeddings(text) {
        // Для OpenAI тоже можно добавить чанкинг, если нужно
        const vector = await this.getEmbedding(text);
        return [{ text, vector }];
    }
    getDimensions() {
        return this.dimensions;
    }
}
class NoOpEmbeddingService {
    dimensions;
    constructor() {
        this.dimensions = config_1.config.embedding.dimensions;
    }
    async getEmbedding(_text) {
        return Array(this.dimensions).fill(0);
    }
    async getChunksAndEmbeddings(text) {
        return [{ text, vector: await this.getEmbedding(text) }];
    }
    getDimensions() {
        return this.dimensions;
    }
}
function createEmbeddingService() {
    switch (config_1.config.embedding.provider) {
        case 'huggingface-tei':
            return new HuggingFaceTEIService();
        case 'openai':
            return new OpenAIEmbeddingService();
        case 'none':
        default:
            return new NoOpEmbeddingService();
    }
}
exports.embeddingService = createEmbeddingService();
//# sourceMappingURL=embedding.service.js.map