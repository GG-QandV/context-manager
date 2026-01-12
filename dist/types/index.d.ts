export declare const LOGICAL_SECTIONS: readonly ["backend", "frontend", "database", "admin-panel", "shared", "infrastructure", "testing", "documentation", "deployment", "staging", "production", "monitoring", "logging", "scaling", "backup", "disaster-recovery", "marketing", "promotion", "sales", "branding", "content", "social-media", "email-marketing", "referral", "affiliate", "ambassador", "product", "features", "roadmap", "feedback", "analytics", "growth", "retention", "churn", "optimization", "experimentation", "customers", "users", "audience", "market", "competitors", "pricing", "monetization", "subscription", "support", "helpdesk", "faq", "security", "compliance", "privacy", "incident", "integrations", "partnerships", "apis", "webhooks"];
export declare const MODULES: readonly ["f1", "f2", "f3", "f4", "f5", "f6", "shared", "none"];
export declare const PRIORITIES: readonly ["high", "medium", "low"];
export declare const DEPLOYMENT_STAGES: readonly ["development", "staging", "production", "maintenance"];
export declare const MARKET_PHASES: readonly ["pre-launch", "launch", "growth", "maturity", "decline"];
export declare const SYNC_STATUSES: readonly ["pending", "synced", "failed"];
export type LogicalSection = typeof LOGICAL_SECTIONS[number];
export type Module = typeof MODULES[number];
export type Priority = typeof PRIORITIES[number];
export type DeploymentStage = typeof DEPLOYMENT_STAGES[number];
export type MarketPhase = typeof MARKET_PHASES[number];
export type SyncStatus = typeof SYNC_STATUSES[number];
export interface ContextRecord {
    id: number;
    sync_id: string;
    session_id: string;
    context_type: string;
    content: string;
    summary: string;
    tags: string[];
    metadata: Record<string, unknown>;
    project_id: string;
    logical_section: LogicalSection | null;
    module: Module | null;
    tech_tags: string[];
    phase: string | null;
    priority: Priority | null;
    deployment_stage: DeploymentStage | null;
    market_phase: MarketPhase | null;
    sync_status: SyncStatus;
    synced_at: Date | null;
    created_at: Date;
    date: Date;
}
export interface PaginationParams {
    cursor?: string;
    limit?: number;
}
export interface PaginatedResponse<T> {
    success: boolean;
    results: T[];
    pagination: {
        hasMore: boolean;
        nextCursor: string | null;
        count: number;
    };
}
//# sourceMappingURL=index.d.ts.map