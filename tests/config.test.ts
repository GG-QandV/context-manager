import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

const CONFIG_PATH = require.resolve('../src/config');

describe('loadConfig', () => {
  beforeEach(() => {
    delete require.cache[CONFIG_PATH];
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.QDRANT_HOST;
    delete process.env.QDRANT_PORT;
    delete process.env.TEI_HOST;
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.SYNC_ENABLED;
    delete process.env.SYNC_INTERVAL_MS;
    delete process.env.SYNC_BATCH_SIZE;
  });

  function loadConfig() {
    return require('../src/config').config;
  }

  it('throws when DATABASE_URL is missing', () => {
    assert.throws(() => loadConfig(), /DATABASE_URL/);
  });

  it('uses defaults when only DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    const cfg = loadConfig();

    assert.strictEqual(cfg.port, 3847);
    assert.strictEqual(cfg.host, '0.0.0.0');
    assert.strictEqual(cfg.database.url, 'postgresql://test:localhost:5432/test');
    assert.strictEqual(cfg.database.poolSize, 20);
    assert.strictEqual(cfg.qdrant.host, 'qdrant-new');
    assert.strictEqual(cfg.qdrant.port, 6333);
    assert.strictEqual(cfg.tei.url, 'http://tei-embeddings:80');
    assert.strictEqual(cfg.embedding.provider, 'huggingface-tei');
    assert.strictEqual(cfg.embedding.dimensions, 384);
    assert.strictEqual(cfg.sync.enabled, true);
    assert.strictEqual(cfg.sync.intervalMs, 60000);
    assert.strictEqual(cfg.sync.batchSize, 100);
  });

  it('overrides port and host from env', () => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    process.env.PORT = '8080';
    process.env.HOST = '127.0.0.1';

    const cfg = loadConfig();
    assert.strictEqual(cfg.port, 8080);
    assert.strictEqual(cfg.host, '127.0.0.1');
  });

  it('overrides Qdrant config from env', () => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    process.env.QDRANT_HOST = 'qdrant-test';
    process.env.QDRANT_PORT = '9999';

    const cfg = loadConfig();
    assert.strictEqual(cfg.qdrant.host, 'qdrant-test');
    assert.strictEqual(cfg.qdrant.port, 9999);
  });

  it('overrides TEI url from env', () => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    process.env.TEI_HOST = 'http://tei-custom:8080';

    const cfg = loadConfig();
    assert.strictEqual(cfg.tei.url, 'http://tei-custom:8080');
  });

  it('overrides sync config from env', () => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    process.env.SYNC_ENABLED = 'false';
    process.env.SYNC_INTERVAL_MS = '5000';
    process.env.SYNC_BATCH_SIZE = '25';

    const cfg = loadConfig();
    assert.strictEqual(cfg.sync.enabled, false);
    assert.strictEqual(cfg.sync.intervalMs, 5000);
    assert.strictEqual(cfg.sync.batchSize, 25);
  });

  it('recognizes openai provider but requires API key', () => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    process.env.EMBEDDING_PROVIDER = 'openai';

    assert.throws(() => loadConfig(), /OPENAI_API_KEY/);
  });

  it('accepts openai with API key', () => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const cfg = loadConfig();
    assert.strictEqual(cfg.embedding.provider, 'openai');
    assert.strictEqual(cfg.embedding.openaiApiKey, 'sk-test-key');
  });

  it('accepts none provider without API key', () => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    process.env.EMBEDDING_PROVIDER = 'none';

    const cfg = loadConfig();
    assert.strictEqual(cfg.embedding.provider, 'none');
  });
});
