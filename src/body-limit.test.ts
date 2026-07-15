import { describe, it } from 'node:test';
import assert from 'node:assert';
import { bodyAccumulator, MAX_BODY_BYTES } from './body-limit.js';

describe('bodyAccumulator', () => {
  it('accumulates under-limit chunks and push returns true', () => {
    const acc = bodyAccumulator(10);
    assert.strictEqual(acc.push(Buffer.from('hello')), true);
    assert.strictEqual(acc.push(Buffer.from('world')), true);
    assert.strictEqual(acc.total(), 10);
    assert.deepStrictEqual(acc.chunks.map((c) => c.toString()), ['hello', 'world']);
  });

  it('returns false and stops accumulating when over limit', () => {
    const acc = bodyAccumulator(5);
    assert.strictEqual(acc.push(Buffer.from('hi')), true);
    assert.strictEqual(acc.push(Buffer.from('there')), false);
    assert.strictEqual(acc.total(), 7);
    assert.deepStrictEqual(acc.chunks.map((c) => c.toString()), ['hi']);
  });

  it('default max equals 50 MB', () => {
    assert.strictEqual(MAX_BODY_BYTES, 50 * 1024 * 1024);
  });
});
