import { ContextRecord, SemanticSearchResult } from '../types';
import { SaveContextBody, SemanticSearchBody } from '../schemas/context.schema';
declare class QdrantService {
    private client;
    private collectionName;
    constructor();
    healthCheck(): Promise<boolean>;
    initializeSchema(): Promise<void>;
    createContext(data: SaveContextBody, syncId: string): Promise<void>;
    batchCreateContexts(records: ContextRecord[]): Promise<{
        successful: string[];
        failed: string[];
    }>;
    semanticSearch(params: SemanticSearchBody): Promise<SemanticSearchResult[]>;
}
export declare const qdrantService: QdrantService;
export {};
//# sourceMappingURL=qdrant.service.d.ts.map