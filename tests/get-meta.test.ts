import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('getMeta', () => {
  it('returns the value for existing field', () => {
    const { getMeta } = require('../src/types');
    assert.strictEqual(getMeta({ agent: 'test-agent' }, 'agent'), 'test-agent');
  });

  it('returns undefined for missing field', () => {
    const { getMeta } = require('../src/types');
    assert.strictEqual(getMeta({}, 'agent'), undefined);
  });

  it('returns undefined for empty metadata', () => {
    const { getMeta } = require('../src/types');
    assert.strictEqual(getMeta({}, 'mode'), undefined);
  });

  it('returns the mode string when set', () => {
    const { getMeta } = require('../src/types');
    assert.strictEqual(getMeta({ mode: 'important' }, 'mode'), 'important');
  });

  it('returns topics string when set', () => {
    const { getMeta } = require('../src/types');
    assert.strictEqual(getMeta({ topics: 'test,topics' }, 'topics'), 'test,topics');
  });
});
