import { Static } from '@sinclair/typebox';
export declare const SaveContextBodySchema: import("@sinclair/typebox").TObject<{
    sessionId: import("@sinclair/typebox").TString;
    contextType: import("@sinclair/typebox").TString;
    content: import("@sinclair/typebox").TString;
    summary: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    tags: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
    metadata: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TUnknown>>;
    projectId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    logicalSection: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"backend" | "frontend" | "database" | "admin-panel" | "shared" | "infrastructure" | "testing" | "documentation" | "deployment" | "staging" | "production" | "monitoring" | "logging" | "scaling" | "backup" | "disaster-recovery" | "marketing" | "promotion" | "sales" | "branding" | "content" | "social-media" | "email-marketing" | "referral" | "affiliate" | "ambassador" | "product" | "features" | "roadmap" | "feedback" | "analytics" | "growth" | "retention" | "churn" | "optimization" | "experimentation" | "customers" | "users" | "audience" | "market" | "competitors" | "pricing" | "monetization" | "subscription" | "support" | "helpdesk" | "faq" | "security" | "compliance" | "privacy" | "incident" | "integrations" | "partnerships" | "apis" | "webhooks">[]>>;
    module: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"none" | "shared" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6">[]>>;
    techTags: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
    phase: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    priority: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"high" | "medium" | "low">[]>>;
    deploymentStage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"staging" | "production" | "development" | "maintenance">[]>>;
    marketPhase: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"growth" | "pre-launch" | "launch" | "maturity" | "decline">[]>>;
}>;
export declare const SearchContextBodySchema: import("@sinclair/typebox").TObject<{
    query: import("@sinclair/typebox").TString;
    filters: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        sessionId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        contextType: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        logicalSection: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"backend" | "frontend" | "database" | "admin-panel" | "shared" | "infrastructure" | "testing" | "documentation" | "deployment" | "staging" | "production" | "monitoring" | "logging" | "scaling" | "backup" | "disaster-recovery" | "marketing" | "promotion" | "sales" | "branding" | "content" | "social-media" | "email-marketing" | "referral" | "affiliate" | "ambassador" | "product" | "features" | "roadmap" | "feedback" | "analytics" | "growth" | "retention" | "churn" | "optimization" | "experimentation" | "customers" | "users" | "audience" | "market" | "competitors" | "pricing" | "monetization" | "subscription" | "support" | "helpdesk" | "faq" | "security" | "compliance" | "privacy" | "incident" | "integrations" | "partnerships" | "apis" | "webhooks">[]>>;
        module: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"none" | "shared" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6">[]>>;
        phase: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        priority: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"high" | "medium" | "low">[]>>;
        deploymentStage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"staging" | "production" | "development" | "maintenance">[]>>;
        marketPhase: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"growth" | "pre-launch" | "launch" | "maturity" | "decline">[]>>;
        tags: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        techTags: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        projectId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    }>>;
    limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
export declare const SemanticSearchBodySchema: import("@sinclair/typebox").TObject<{
    query: import("@sinclair/typebox").TString;
    filters: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
        logicalSection: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"backend" | "frontend" | "database" | "admin-panel" | "shared" | "infrastructure" | "testing" | "documentation" | "deployment" | "staging" | "production" | "monitoring" | "logging" | "scaling" | "backup" | "disaster-recovery" | "marketing" | "promotion" | "sales" | "branding" | "content" | "social-media" | "email-marketing" | "referral" | "affiliate" | "ambassador" | "product" | "features" | "roadmap" | "feedback" | "analytics" | "growth" | "retention" | "churn" | "optimization" | "experimentation" | "customers" | "users" | "audience" | "market" | "competitors" | "pricing" | "monetization" | "subscription" | "support" | "helpdesk" | "faq" | "security" | "compliance" | "privacy" | "incident" | "integrations" | "partnerships" | "apis" | "webhooks">[]>>;
        module: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"none" | "shared" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6">[]>>;
        projectId: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    }>>;
    limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    certaintyThreshold: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
export declare const SessionIdParamSchema: import("@sinclair/typebox").TObject<{
    sessionId: import("@sinclair/typebox").TString;
}>;
export declare const SyncIdParamSchema: import("@sinclair/typebox").TObject<{
    syncId: import("@sinclair/typebox").TString;
}>;
export declare const LogicalSectionParamSchema: import("@sinclair/typebox").TObject<{
    logicalSection: import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"backend" | "frontend" | "database" | "admin-panel" | "shared" | "infrastructure" | "testing" | "documentation" | "deployment" | "staging" | "production" | "monitoring" | "logging" | "scaling" | "backup" | "disaster-recovery" | "marketing" | "promotion" | "sales" | "branding" | "content" | "social-media" | "email-marketing" | "referral" | "affiliate" | "ambassador" | "product" | "features" | "roadmap" | "feedback" | "analytics" | "growth" | "retention" | "churn" | "optimization" | "experimentation" | "customers" | "users" | "audience" | "market" | "competitors" | "pricing" | "monetization" | "subscription" | "support" | "helpdesk" | "faq" | "security" | "compliance" | "privacy" | "incident" | "integrations" | "partnerships" | "apis" | "webhooks">[]>;
}>;
export declare const ModuleParamSchema: import("@sinclair/typebox").TObject<{
    moduleId: import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"none" | "shared" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6">[]>;
}>;
export declare const PriorityParamSchema: import("@sinclair/typebox").TObject<{
    priority: import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"high" | "medium" | "low">[]>;
}>;
export declare const DeploymentStageParamSchema: import("@sinclair/typebox").TObject<{
    stage: import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"staging" | "production" | "development" | "maintenance">[]>;
}>;
export declare const MarketPhaseParamSchema: import("@sinclair/typebox").TObject<{
    phase: import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"growth" | "pre-launch" | "launch" | "maturity" | "decline">[]>;
}>;
export declare const OffsetParamSchema: import("@sinclair/typebox").TObject<{
    offset: import("@sinclair/typebox").TString;
}>;
export declare const PaginationQuerySchema: import("@sinclair/typebox").TObject<{
    cursor: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
export declare const SuccessResponseSchema: import("@sinclair/typebox").TObject<{
    success: import("@sinclair/typebox").TLiteral<true>;
}>;
export declare const ErrorResponseSchema: import("@sinclair/typebox").TObject<{
    success: import("@sinclair/typebox").TLiteral<false>;
    error: import("@sinclair/typebox").TString;
    code: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
}>;
export type SaveContextBody = Static<typeof SaveContextBodySchema>;
export type SearchContextBody = Static<typeof SearchContextBodySchema>;
export type SemanticSearchBody = Static<typeof SemanticSearchBodySchema>;
export type PaginationQuery = Static<typeof PaginationQuerySchema>;
//# sourceMappingURL=context.schema.d.ts.map