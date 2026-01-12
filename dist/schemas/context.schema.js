"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorResponseSchema = exports.SuccessResponseSchema = exports.PaginationQuerySchema = exports.OffsetParamSchema = exports.MarketPhaseParamSchema = exports.DeploymentStageParamSchema = exports.PriorityParamSchema = exports.ModuleParamSchema = exports.LogicalSectionParamSchema = exports.SyncIdParamSchema = exports.SessionIdParamSchema = exports.SemanticSearchBodySchema = exports.SearchContextBodySchema = exports.SaveContextBodySchema = void 0;
const typebox_1 = require("@sinclair/typebox");
const types_1 = require("../types");
// Enum schemas
const LogicalSectionSchema = typebox_1.Type.Union(types_1.LOGICAL_SECTIONS.map(s => typebox_1.Type.Literal(s)));
const ModuleSchema = typebox_1.Type.Union(types_1.MODULES.map(m => typebox_1.Type.Literal(m)));
const PrioritySchema = typebox_1.Type.Union(types_1.PRIORITIES.map(p => typebox_1.Type.Literal(p)));
const DeploymentStageSchema = typebox_1.Type.Union(types_1.DEPLOYMENT_STAGES.map(d => typebox_1.Type.Literal(d)));
const MarketPhaseSchema = typebox_1.Type.Union(types_1.MARKET_PHASES.map(m => typebox_1.Type.Literal(m)));
// Request schemas
exports.SaveContextBodySchema = typebox_1.Type.Object({
    sessionId: typebox_1.Type.String({ minLength: 1 }),
    contextType: typebox_1.Type.String({ minLength: 1 }),
    content: typebox_1.Type.String({ minLength: 1 }),
    summary: typebox_1.Type.Optional(typebox_1.Type.String()),
    tags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String())),
    metadata: typebox_1.Type.Optional(typebox_1.Type.Record(typebox_1.Type.String(), typebox_1.Type.Unknown())),
    projectId: typebox_1.Type.Optional(typebox_1.Type.String()),
    logicalSection: typebox_1.Type.Optional(LogicalSectionSchema),
    module: typebox_1.Type.Optional(ModuleSchema),
    techTags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String())),
    phase: typebox_1.Type.Optional(typebox_1.Type.String()),
    priority: typebox_1.Type.Optional(PrioritySchema),
    deploymentStage: typebox_1.Type.Optional(DeploymentStageSchema),
    marketPhase: typebox_1.Type.Optional(MarketPhaseSchema),
});
exports.SearchContextBodySchema = typebox_1.Type.Object({
    query: typebox_1.Type.String({ minLength: 1 }),
    filters: typebox_1.Type.Optional(typebox_1.Type.Object({
        sessionId: typebox_1.Type.Optional(typebox_1.Type.String()),
        contextType: typebox_1.Type.Optional(typebox_1.Type.String()),
        logicalSection: typebox_1.Type.Optional(LogicalSectionSchema),
        module: typebox_1.Type.Optional(ModuleSchema),
        phase: typebox_1.Type.Optional(typebox_1.Type.String()),
        priority: typebox_1.Type.Optional(PrioritySchema),
        deploymentStage: typebox_1.Type.Optional(DeploymentStageSchema),
        marketPhase: typebox_1.Type.Optional(MarketPhaseSchema),
        tags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String())),
        techTags: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String())),
        projectId: typebox_1.Type.Optional(typebox_1.Type.String()),
    })),
    limit: typebox_1.Type.Optional(typebox_1.Type.Number({ minimum: 1, maximum: 100, default: 10 })),
});
exports.SemanticSearchBodySchema = typebox_1.Type.Object({
    query: typebox_1.Type.String({ minLength: 1 }),
    filters: typebox_1.Type.Optional(typebox_1.Type.Object({
        logicalSection: typebox_1.Type.Optional(LogicalSectionSchema),
        module: typebox_1.Type.Optional(ModuleSchema),
        projectId: typebox_1.Type.Optional(typebox_1.Type.String()),
    })),
    limit: typebox_1.Type.Optional(typebox_1.Type.Number({ minimum: 1, maximum: 100, default: 10 })),
    certaintyThreshold: typebox_1.Type.Optional(typebox_1.Type.Number({ minimum: 0, maximum: 1, default: 0.7 })),
});
// Param schemas
exports.SessionIdParamSchema = typebox_1.Type.Object({
    sessionId: typebox_1.Type.String({ minLength: 1 }),
});
exports.SyncIdParamSchema = typebox_1.Type.Object({
    syncId: typebox_1.Type.String({ minLength: 1 }),
});
exports.LogicalSectionParamSchema = typebox_1.Type.Object({
    logicalSection: LogicalSectionSchema,
});
exports.ModuleParamSchema = typebox_1.Type.Object({
    moduleId: ModuleSchema,
});
exports.PriorityParamSchema = typebox_1.Type.Object({
    priority: PrioritySchema,
});
exports.DeploymentStageParamSchema = typebox_1.Type.Object({
    stage: DeploymentStageSchema,
});
exports.MarketPhaseParamSchema = typebox_1.Type.Object({
    phase: MarketPhaseSchema,
});
exports.OffsetParamSchema = typebox_1.Type.Object({
    offset: typebox_1.Type.String({ pattern: '^[0-9]+$' }),
});
// Query schemas
exports.PaginationQuerySchema = typebox_1.Type.Object({
    cursor: typebox_1.Type.Optional(typebox_1.Type.String()),
    limit: typebox_1.Type.Optional(typebox_1.Type.Number({ minimum: 1, maximum: 100, default: 50 })),
});
// Response schemas
exports.SuccessResponseSchema = typebox_1.Type.Object({
    success: typebox_1.Type.Literal(true),
});
exports.ErrorResponseSchema = typebox_1.Type.Object({
    success: typebox_1.Type.Literal(false),
    error: typebox_1.Type.String(),
    code: typebox_1.Type.Optional(typebox_1.Type.String()),
});
//# sourceMappingURL=context.schema.js.map