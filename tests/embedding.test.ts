import { describe, it, before } from 'node:test';
import assert from 'node:assert';

describe('embeddingService', () => {
  let embeddingService: any;

  before(() => {
    process.env.DATABASE_URL = 'postgresql://test:localhost:5432/test';
    process.env.EMBEDDING_PROVIDER = 'none';
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/services/embedding.service')];
    embeddingService = require('../src/services/embedding.service').embeddingService;
  });

  it('returns zero vector for getEmbedding', async () => {
    const vec = await embeddingService.getEmbedding('test text');
    assert(Array.isArray(vec));
    assert(vec.length > 0);
    assert(vec.every((v: number) => v === 0));
  });

  it('returns zero vectors for getEmbeddingBatch', async () => {
    const vecs = await embeddingService.getEmbeddingBatch(['a', 'b', 'c']);
    assert.strictEqual(vecs.length, 3);
    for (const vec of vecs) {
      assert(vec.every((v: number) => v === 0));
    }
  });

  it('getChunksAndEmbeddings returns single chunk', async () => {
    const result = await embeddingService.getChunksAndEmbeddings('short text');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].text, 'short text');
    assert(Array.isArray(result[0].vector));
  });

  it('getDimensions returns configured dimension', () => {
    const dims = embeddingService.getDimensions();
    assert(typeof dims === 'number');
    assert(dims > 0);
  });
});
