import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

const SYNC_SERVICE_PATH = require.resolve('../src/services/sync.service');

describe('batchSync', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    mock.restoreAll();
  });

  function freshBatchSync() {
    delete require.cache[SYNC_SERVICE_PATH];
    return require('../src/services/sync.service').batchSync;
  }

  it('returns zeros when no pending records', async () => {
    const { postgresService } = require('../src/services/postgres.service');
    mock.method(postgresService, 'getPendingSyncRecords', async () => []);

    const batchSync = freshBatchSync();
    const result = await batchSync(100);

    assert.deepStrictEqual(result, { synced: 0, failed: 0, total: 0 });
  });

  it('syncs records and marks successful as synced', async () => {
    const fakeRecords = [
      { id: 1, sync_id: 'sync-1', content: 'test', session_id: 's1', context_type: 'note', summary: 'test', tags: [], tech_tags: [], metadata: {}, project_id: 'default', logical_section: null, module: null, phase: null, priority: null, deployment_stage: null, market_phase: null, sync_status: 'pending', synced_at: null, created_at: new Date(), date: new Date() },
      { id: 2, sync_id: 'sync-2', content: 'test2', session_id: 's2', context_type: 'note', summary: 'test2', tags: [], tech_tags: [], metadata: {}, project_id: 'default', logical_section: null, module: null, phase: null, priority: null, deployment_stage: null, market_phase: null, sync_status: 'pending', synced_at: null, created_at: new Date(), date: new Date() },
    ];

    const { postgresService } = require('../src/services/postgres.service');
    const { qdrantService } = require('../src/services/qdrant.service');

    mock.method(postgresService, 'getPendingSyncRecords', async () => fakeRecords);
    mock.method(qdrantService, 'batchCreateContexts', async () => ({
      successful: ['sync-1', 'sync-2'],
      failed: [],
    }));
    mock.method(postgresService, 'batchUpdateSyncStatus', async () => {});

    const batchSync = freshBatchSync();
    const result = await batchSync(100);

    assert.strictEqual(result.synced, 2);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.total, 2);
  });

  it('marks failed records as failed', async () => {
    const fakeRecords = [
      { id: 1, sync_id: 'sync-fail', content: 'fail', session_id: 's1', context_type: 'note', summary: 'fail', tags: [], tech_tags: [], metadata: {}, project_id: 'default', logical_section: null, module: null, phase: null, priority: null, deployment_stage: null, market_phase: null, sync_status: 'pending', synced_at: null, created_at: new Date(), date: new Date() },
    ];

    const { postgresService } = require('../src/services/postgres.service');
    const { qdrantService } = require('../src/services/qdrant.service');

    mock.method(postgresService, 'getPendingSyncRecords', async () => fakeRecords);
    mock.method(qdrantService, 'batchCreateContexts', async () => ({
      successful: [],
      failed: ['sync-fail'],
    }));
    mock.method(postgresService, 'batchUpdateSyncStatus', async () => {});

    const batchSync = freshBatchSync();
    const result = await batchSync(100);

    assert.strictEqual(result.synced, 0);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.total, 1);
  });

  it('passes batchSize to getPendingSyncRecords', async () => {
    const { postgresService } = require('../src/services/postgres.service');
    const { qdrantService } = require('../src/services/qdrant.service');

    let actualBatchSize: number | undefined;
    mock.method(postgresService, 'getPendingSyncRecords', async (limit: number) => {
      actualBatchSize = limit;
      return [];
    });

    const batchSync = freshBatchSync();
    await batchSync(42);

    assert.strictEqual(actualBatchSize, 42);
  });
});
