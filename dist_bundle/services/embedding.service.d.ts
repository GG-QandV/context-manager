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
    getChunksAndEmbeddings(text: string): Promise<ChunkedEmbedding[]>;
    getDimensions(): number;
}
export declare const embeddingService: EmbeddingService;
//# sourceMappingURL=embedding.service.d.ts.map