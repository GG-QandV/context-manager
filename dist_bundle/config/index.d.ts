export interface Config {
    port: number;
    host: string;
    database: {
        url: string;
        poolSize: number;
        idleTimeout: number;
    };
    qdrant: {
        host: string;
        port: number;
    };
    tei: {
        url: string;
    };
    embedding: {
        provider: 'openai' | 'huggingface-tei' | 'none';
        openaiApiKey?: string;
        model: string;
        dimensions: number;
    };
    sync: {
        batchSize: number;
        intervalMs: number;
    };
}
export declare const config: Config;
//# sourceMappingURL=index.d.ts.map