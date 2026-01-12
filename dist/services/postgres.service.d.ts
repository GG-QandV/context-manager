import { PoolClient } from 'pg';
import { ContextRecord, LogicalSection, Module, Priority, DeploymentStage, MarketPhase, SyncStatus } from '../types';
import { SaveContextBody, SearchContextBody } from '../schemas/context.schema';
export declare class PostgresService {
    private pool;
    constructor();
    healthCheck(): Promise<boolean>;
    close(): Promise<void>;
    withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
    generateSyncId(): string;
    createContext(data: SaveContextBody, syncId: string): Promise<{
        id: number;
        syncId: string;
    }>;
    updateSyncStatus(syncId: string, status: SyncStatus): Promise<void>;
    batchUpdateSyncStatus(syncIds: string[], status: SyncStatus): Promise<void>;
    searchContexts(params: SearchContextBody): Promise<ContextRecord[]>;
    getBySession(sessionId: string, cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    getBySyncId(syncId: string): Promise<ContextRecord | null>;
    getByDateOffset(offset: number, cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
        date: string;
    }>;
    getByLogicalSection(section: LogicalSection, cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    getByModule(module: Module, cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    getBySectionAndModule(section: LogicalSection, module: Module, cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    getByPriority(priority: Priority, cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    getByDeploymentStage(stage: DeploymentStage, cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    getByMarketPhase(phase: MarketPhase, cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    getPendingSyncRecords(limit?: number): Promise<ContextRecord[]>;
    getMarketingSummary(): Promise<{
        sections: Array<{
            logical_section: string;
            total_contexts: number;
            unique_sessions: number;
        }>;
        total: number;
    }>;
    getProductRoadmap(cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    getCompetitorAnalysis(cursor?: string, limit?: number): Promise<{
        records: ContextRecord[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    executeRawQuery(query: string, params?: any[]): Promise<import("pg").QueryResult<any>>;
}
export declare const postgresService: PostgresService;
//# sourceMappingURL=postgres.service.d.ts.map