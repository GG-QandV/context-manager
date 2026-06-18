import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('postgresService.generateSyncId', () => {
  let postgresService: any;

  before(() => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/services/postgres.service')];
    postgresService = require('../src/services/postgres.service').postgresService;
  });

  it('returns a string', () => {
    const id = postgresService.generateSyncId();
    assert.strictEqual(typeof id, 'string');
  });

  it('contains timestamp followed by dash and random chars', () => {
    const id = postgresService.generateSyncId();
    assert.match(id, /^\d+-\w+$/);
  });

  it('generates unique values on successive calls', () => {
    const id1 = postgresService.generateSyncId();
    const id2 = postgresService.generateSyncId();
    assert.notStrictEqual(id1, id2);
  });
});
