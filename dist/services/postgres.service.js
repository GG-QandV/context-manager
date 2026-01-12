"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postgresService = exports.PostgresService = void 0;
const pg_1 = require("pg");
const config_1 = require("../config");
class PostgresService {
    pool;
    constructor() {
        this.pool = new pg_1.Pool({
            connectionString: config_1.config.database.url,
            max: config_1.config.database.poolSize,
            idleTimeoutMillis: config_1.config.database.idleTimeout,
        });
        this.pool.on('error', (err) => {
            console.error('Unexpected PostgreSQL error:', err);
        });
    }
    async healthCheck() {
        try {
            const result = await this.pool.query('SELECT 1');
            return result.rows.length > 0;
        }
        catch {
            return false;
        }
    }
    async close() {
        await this.pool.end();
    }
    async withTransaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    generateSyncId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    async createContext(data, syncId) {
        const summary = data.summary ||
            data.content.substring(0, 200) + (data.content.length > 200 ? '...' : '');
        const result = await this.pool.query(`INSERT INTO development_context 
       (sync_id, session_id, context_type, content, summary, tags, metadata, 
        project_id, logical_section, module, tech_tags, phase, priority, 
        deployment_stage, market_phase, sync_status)
       VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text[], $7::jsonb, 
               $8::text, $9::text, $10::text, $11::text[], $12::text, $13::text, 
               $14::text, $15::text, 'pending'::text)
       RETURNING id`, [
            syncId,
            data.sessionId,
            data.contextType,
            data.content,
            summary,
            data.tags || [],
            JSON.stringify(data.metadata || {}),
            data.projectId || 'default',
            data.logicalSection || null,
            data.module || null,
            data.techTags || [],
            data.phase || null,
            data.priority || null,
            data.deploymentStage || null,
            data.marketPhase || null,
        ]);
        return { id: result.rows[0].id, syncId };
    }
    async updateSyncStatus(syncId, status) {
        await this.pool.query(`UPDATE development_context 
       SET sync_status = $1::text, synced_at = CASE WHEN $1::text = 'synced' THEN NOW() ELSE synced_at END
       WHERE sync_id = $2::text`, [status, syncId]);
    }
    async batchUpdateSyncStatus(syncIds, status) {
        if (syncIds.length === 0)
            return;
        await this.pool.query(`UPDATE development_context 
       SET sync_status = $1::text, synced_at = CASE WHEN $1::text = 'synced' THEN NOW() ELSE synced_at END
       WHERE sync_id = ANY($2::text[])`, [status, syncIds]);
    }
    async searchContexts(params) {
        const { query, filters, limit = 10 } = params;
        let sql = `
      SELECT *, 
             ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
      FROM development_context
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
    `;
        const queryParams = [query];
        let paramIndex = 2;
        if (filters) {
            if (filters.sessionId) {
                sql += ` AND session_id = $${paramIndex++}::text`;
                queryParams.push(filters.sessionId);
            }
            if (filters.contextType) {
                sql += ` AND context_type = $${paramIndex++}::text`;
                queryParams.push(filters.contextType);
            }
            if (filters.logicalSection) {
                sql += ` AND logical_section = $${paramIndex++}::text`;
                queryParams.push(filters.logicalSection);
            }
            if (filters.module) {
                sql += ` AND module = $${paramIndex++}::text`;
                queryParams.push(filters.module);
            }
            if (filters.phase) {
                sql += ` AND phase = $${paramIndex++}::text`;
                queryParams.push(filters.phase);
            }
            if (filters.priority) {
                sql += ` AND priority = $${paramIndex++}::text`;
                queryParams.push(filters.priority);
            }
            if (filters.deploymentStage) {
                sql += ` AND deployment_stage = $${paramIndex++}::text`;
                queryParams.push(filters.deploymentStage);
            }
            if (filters.marketPhase) {
                sql += ` AND market_phase = $${paramIndex++}::text`;
                queryParams.push(filters.marketPhase);
            }
            if (filters.tags && filters.tags.length > 0) {
                sql += ` AND tags && $${paramIndex++}::text[]`;
                queryParams.push(filters.tags);
            }
            if (filters.techTags && filters.techTags.length > 0) {
                sql += ` AND tech_tags && $${paramIndex++}::text[]`;
                queryParams.push(filters.techTags);
            }
            if (filters.projectId) {
                sql += ` AND project_id = $${paramIndex++}::text`;
                queryParams.push(filters.projectId);
            }
        }
        sql += ` ORDER BY rank DESC LIMIT $${paramIndex}::int`;
        queryParams.push(Math.min(limit, 100));
        const result = await this.pool.query(sql, queryParams);
        return result.rows;
    }
    async getBySession(sessionId, cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        let sql = `
      SELECT * FROM development_context 
      WHERE session_id = $1::text
    `;
        const params = [sessionId];
        if (cursor) {
            sql += ` AND created_at > $2::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at ASC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async getBySyncId(syncId) {
        const result = await this.pool.query('SELECT * FROM development_context WHERE sync_id = $1::text', [syncId]);
        return result.rows[0] || null;
    }
    async getByDateOffset(offset, cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        const safeOffset = Math.max(0, Math.min(offset, 365));
        // Используем created_at::date вместо колонки date
        let sql = `
      SELECT * FROM development_context 
      WHERE created_at::date = CURRENT_DATE - $1::int
    `;
        const params = [safeOffset];
        if (cursor) {
            sql += ` AND created_at > $2::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at ASC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - safeOffset);
        return {
            records,
            hasMore,
            nextCursor,
            date: targetDate.toISOString().split('T')[0]
        };
    }
    async getByLogicalSection(section, cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        let sql = `
      SELECT * FROM development_context 
      WHERE logical_section = $1::text
    `;
        const params = [section];
        if (cursor) {
            sql += ` AND created_at < $2::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async getByModule(module, cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        let sql = `
      SELECT * FROM development_context 
      WHERE module = $1::text
    `;
        const params = [module];
        if (cursor) {
            sql += ` AND created_at < $2::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async getBySectionAndModule(section, module, cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        let sql = `
      SELECT * FROM development_context 
      WHERE logical_section = $1::text AND module = $2::text
    `;
        const params = [section, module];
        if (cursor) {
            sql += ` AND created_at < $3::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async getByPriority(priority, cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        let sql = `
      SELECT * FROM development_context 
      WHERE priority = $1::text
    `;
        const params = [priority];
        if (cursor) {
            sql += ` AND created_at < $2::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async getByDeploymentStage(stage, cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        let sql = `
      SELECT * FROM development_context 
      WHERE deployment_stage = $1::text
    `;
        const params = [stage];
        if (cursor) {
            sql += ` AND created_at < $2::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async getByMarketPhase(phase, cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        let sql = `
      SELECT * FROM development_context 
      WHERE market_phase = $1::text
    `;
        const params = [phase];
        if (cursor) {
            sql += ` AND created_at < $2::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async getPendingSyncRecords(limit = 100) {
        const result = await this.pool.query(`SELECT * FROM development_context 
       WHERE sync_status IN ('pending', 'failed')
       ORDER BY created_at ASC
       LIMIT $1::int`, [limit]);
        return result.rows;
    }
    async getMarketingSummary() {
        const marketingSections = [
            'marketing', 'promotion', 'sales', 'branding', 'content',
            'social-media', 'email-marketing', 'referral', 'affiliate', 'ambassador'
        ];
        const result = await this.pool.query(`SELECT 
        logical_section,
        COUNT(*)::text as total_contexts,
        COUNT(DISTINCT session_id)::text as unique_sessions
       FROM development_context
       WHERE logical_section = ANY($1::text[])
       GROUP BY logical_section
       ORDER BY COUNT(*) DESC`, [marketingSections]);
        const sections = result.rows.map(r => ({
            logical_section: r.logical_section,
            total_contexts: parseInt(r.total_contexts, 10),
            unique_sessions: parseInt(r.unique_sessions, 10),
        }));
        return {
            sections,
            total: sections.reduce((sum, s) => sum + s.total_contexts, 0),
        };
    }
    async getProductRoadmap(cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        const productSections = ['product', 'features', 'roadmap'];
        let sql = `
      SELECT * FROM development_context 
      WHERE logical_section = ANY($1::text[])
    `;
        const params = [productSections];
        if (cursor) {
            sql += ` AND created_at < $2::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async getCompetitorAnalysis(cursor, limit = 50) {
        const safeLimit = Math.min(limit, 100);
        let sql = `
      SELECT * FROM development_context 
      WHERE logical_section = 'competitors'
    `;
        const params = [];
        if (cursor) {
            sql += ` AND created_at < $1::timestamp`;
            params.push(new Date(cursor));
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}::int`;
        params.push(safeLimit + 1);
        const result = await this.pool.query(sql, params);
        const hasMore = result.rows.length > safeLimit;
        const records = hasMore ? result.rows.slice(0, -1) : result.rows;
        const nextCursor = hasMore && records.length > 0
            ? records[records.length - 1].created_at.toISOString()
            : null;
        return { records, hasMore, nextCursor };
    }
    async executeRawQuery(query, params = []) {
        return await this.pool.query(query, params);
    }
}
exports.PostgresService = PostgresService;
exports.postgresService = new PostgresService();
//# sourceMappingURL=postgres.service.js.map