export interface ChunkedEmbedding {
    text: string;
    vector: number[];
}
export interface EmbeddingService {
    getEmbedding(text: string): Promise<number[]>;
    getChunksAndEmbeddings(text: string): Promise<ChunkedEmbedding[]>;
    getDimensions(): number;
}
export declare const embeddingService: EmbeddingService;
//# sourceMappingURL=embedding.service.d.ts.map