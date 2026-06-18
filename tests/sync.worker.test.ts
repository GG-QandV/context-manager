import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

const CONFIG_PATH = require.resolve('../src/config');
const WORKER_PATH = require.resolve('../src/workers/sync.worker');

function getConfig() {
  return require('../src/config').config as any;
}

describe('startSyncWorker', () => {
  let config: any;
  let origEnabled: boolean;
  let origIntervalMs: number;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    delete require.cache[CONFIG_PATH];
    config = getConfig();
    origEnabled = config.sync.enabled;
    origIntervalMs = config.sync.intervalMs;
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    if (config) {
      config.sync.enabled = origEnabled;
      config.sync.intervalMs = origIntervalMs;
    }
    mock.restoreAll();
  });

  function freshWorker() {
    delete require.cache[WORKER_PATH];
    return require('../src/workers/sync.worker').startSyncWorker;
  }

  it('returns stop function when disabled', () => {
    config.sync.enabled = false;

    const startSyncWorker = freshWorker();
    const worker = startSyncWorker();

    assert.strictEqual(typeof worker.stop, 'function');
    worker.stop();
  });

  it('does not call batchSync when disabled', () => {
    config.sync.enabled = false;

    const syncSvc = require('../src/services/sync.service');
    let called = false;
    mock.method(syncSvc, 'batchSync', async () => { called = true; return { synced: 0, failed: 0, total: 0 }; });

    const startSyncWorker = freshWorker();
    const worker = startSyncWorker();
    worker.stop();

    assert.strictEqual(called, false);
  });

  it('calls batchSync on interval when enabled', async () => {
    config.sync.enabled = true;
    config.sync.intervalMs = 50;

    const syncSvc = require('../src/services/sync.service');
    const fn = mock.method(syncSvc, 'batchSync', async () => ({ synced: 3, failed: 1, total: 4 }));

    const startSyncWorker = freshWorker();
    const worker = startSyncWorker();

    await new Promise(r => setTimeout(r, 120));

    worker.stop();

    assert(fn.mock.calls.length >= 1, 'batchSync should have been called at least once');
  });

  it('stops calling batchSync after stop()', async () => {
    config.sync.enabled = true;
    config.sync.intervalMs = 20;

    const syncSvc = require('../src/services/sync.service');
    const fn = mock.method(syncSvc, 'batchSync', async () => ({ synced: 1, failed: 0, total: 1 }));

    const startSyncWorker = freshWorker();
    const worker = startSyncWorker();

    await new Promise(r => setTimeout(r, 50));
    worker.stop();

    const countAfterStop = fn.mock.calls.length;

    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(fn.mock.calls.length, countAfterStop, 'no new calls after stop');
  });
});
