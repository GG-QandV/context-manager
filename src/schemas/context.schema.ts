import { Type, Static } from '@sinclair/typebox';
import { 
  LOGICAL_SECTIONS, 
  MODULES, 
  PRIORITIES, 
  DEPLOYMENT_STAGES, 
  MARKET_PHASES 
} from '../types';

// Enum schemas
const LogicalSectionSchema = Type.Union(
  LOGICAL_SECTIONS.map(s => Type.Literal(s))
);

const ModuleSchema = Type.Union(
  MODULES.map(m => Type.Literal(m))
);

const PrioritySchema = Type.Union(
  PRIORITIES.map(p => Type.Literal(p))
);

const DeploymentStageSchema = Type.Union(
  DEPLOYMENT_STAGES.map(d => Type.Literal(d))
);

const MarketPhaseSchema = Type.Union(
  MARKET_PHASES.map(m => Type.Literal(m))
);

// Request schemas
export const SaveContextBodySchema = Type.Object({
  sessionId: Type.String({ minLength: 1 }),
  contextType: Type.String({ minLength: 1 }),
  content: Type.String({ minLength: 1 }),
  summary: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  projectId: Type.Optional(Type.String()),
  logicalSection: Type.Optional(LogicalSectionSchema),
  module: Type.Optional(ModuleSchema),
  techTags: Type.Optional(Type.Array(Type.String())),
  phase: Type.Optional(Type.String()),
  priority: Type.Optional(PrioritySchema),
  deploymentStage: Type.Optional(DeploymentStageSchema),
  marketPhase: Type.Optional(MarketPhaseSchema),
});

export const SearchContextBodySchema = Type.Object({
  query: Type.String({ minLength: 1 }),
  filters: Type.Optional(Type.Object({
    sessionId: Type.Optional(Type.String()),
    contextType: Type.Optional(Type.String()),
    logicalSection: Type.Optional(LogicalSectionSchema),
    module: Type.Optional(ModuleSchema),
    phase: Type.Optional(Type.String()),
    priority: Type.Optional(PrioritySchema),
    deploymentStage: Type.Optional(DeploymentStageSchema),
    marketPhase: Type.Optional(MarketPhaseSchema),
    tags: Type.Optional(Type.Array(Type.String())),
    techTags: Type.Optional(Type.Array(Type.String())),
    projectId: Type.Optional(Type.String()),
  })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 10 })),
});

export const SemanticSearchBodySchema = Type.Object({
  query: Type.String({ minLength: 1 }),
  filters: Type.Optional(Type.Object({
    logicalSection: Type.Optional(LogicalSectionSchema),
    module: Type.Optional(ModuleSchema),
    projectId: Type.Optional(Type.String()),
  })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 10 })),
  certaintyThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.7 })),
});

// Param schemas
export const SessionIdParamSchema = Type.Object({
  sessionId: Type.String({ minLength: 1 }),
});

export const SyncIdParamSchema = Type.Object({
  syncId: Type.String({ minLength: 1 }),
});

export const LogicalSectionParamSchema = Type.Object({
  logicalSection: LogicalSectionSchema,
});

export const ModuleParamSchema = Type.Object({
  moduleId: ModuleSchema,
});

export const PriorityParamSchema = Type.Object({
  priority: PrioritySchema,
});

export const DeploymentStageParamSchema = Type.Object({
  stage: DeploymentStageSchema,
});

export const MarketPhaseParamSchema = Type.Object({
  phase: MarketPhaseSchema,
});

export const OffsetParamSchema = Type.Object({
  offset: Type.String({ pattern: '^[0-9]+$' }),
});

// Query schemas
export const PaginationQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 50 })),
});

// Response schemas
export const SuccessResponseSchema = Type.Object({
  success: Type.Literal(true),
});

export const ErrorResponseSchema = Type.Object({
  success: Type.Literal(false),
  error: Type.String(),
  code: Type.Optional(Type.String()),
});

// Type exports
export type SaveContextBody = Static<typeof SaveContextBodySchema>;
export type SearchContextBody = Static<typeof SearchContextBodySchema>;
export type SemanticSearchBody = Static<typeof SemanticSearchBodySchema>;
export type PaginationQuery = Static<typeof PaginationQuerySchema>;
