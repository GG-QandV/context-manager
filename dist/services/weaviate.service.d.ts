import { ContextRecord } from '../types';
import { SaveContextBody, SemanticSearchBody } from '../schemas/context.schema';
interface WeaviateContextProperties {
    sessionId: string;
    contextType: string;
    content: string;
    summary: string;
    tags: string[];
    timestamp: string;
    projectId: string;
    syncId: string;
    logicalSection: string | null;
    module: string | null;
    techTags: string[];
    phase: string | null;
    priority: string | null;
    deploymentStage: string | null;
    marketPhase: string | null;
}
export declare class WeaviateService {
    private client;
    private maxRetries;
    private retryDelay;
    private className;
    constructor();
    healthCheck(): Promise<boolean>;
    private withRetry;
    createContext(data: SaveContextBody, syncId: string): Promise<void>;
    batchCreateContexts(records: ContextRecord[]): Promise<{
        successful: string[];
        failed: string[];
    }>;
    semanticSearch(params: SemanticSearchBody): Promise<Array<WeaviateContextProperties & {
        certainty: number;
    }>>;
    initializeSchema(): Promise<void>;
}
export declare const weaviateService: WeaviateService;
export {};
//# sourceMappingURL=weaviate.service.d.ts.map