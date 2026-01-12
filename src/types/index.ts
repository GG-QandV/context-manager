export const LOGICAL_SECTIONS = [
  // Development
  'backend', 'frontend', 'database', 'admin-panel', 
  'shared', 'infrastructure', 'testing', 'documentation',
  // Deployment
  'deployment', 'staging', 'production', 'monitoring', 
  'logging', 'scaling', 'backup', 'disaster-recovery',
  // Marketing
  'marketing', 'promotion', 'sales', 'branding', 
  'content', 'social-media', 'email-marketing', 
  'referral', 'affiliate', 'ambassador',
  // Product
  'product', 'features', 'roadmap', 'feedback', 
  'analytics', 'growth', 'retention', 'churn', 
  'optimization', 'experimentation',
  // Business
  'customers', 'users', 'audience', 'market', 
  'competitors', 'pricing', 'monetization', 'subscription',
  // Operations
  'support', 'helpdesk', 'faq', 'security', 
  'compliance', 'privacy', 'incident',
  // Integrations
  'integrations', 'partnerships', 'apis', 'webhooks'
] as const;

export const MODULES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'shared', 'none'] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export const DEPLOYMENT_STAGES = ['development', 'staging', 'production', 'maintenance'] as const;
export const MARKET_PHASES = ['pre-launch', 'launch', 'growth', 'maturity', 'decline'] as const;
export const SYNC_STATUSES = ['pending', 'synced', 'failed'] as const;

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
