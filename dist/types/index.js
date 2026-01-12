"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYNC_STATUSES = exports.MARKET_PHASES = exports.DEPLOYMENT_STAGES = exports.PRIORITIES = exports.MODULES = exports.LOGICAL_SECTIONS = void 0;
exports.LOGICAL_SECTIONS = [
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
];
exports.MODULES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'shared', 'none'];
exports.PRIORITIES = ['high', 'medium', 'low'];
exports.DEPLOYMENT_STAGES = ['development', 'staging', 'production', 'maintenance'];
exports.MARKET_PHASES = ['pre-launch', 'launch', 'growth', 'maturity', 'decline'];
exports.SYNC_STATUSES = ['pending', 'synced', 'failed'];
//# sourceMappingURL=index.js.map