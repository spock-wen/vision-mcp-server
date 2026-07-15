import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPool } from './key-pool.js';
import { createLogger } from '../utils/logger.js';
import { AllKeysUnavailableError } from '../utils/errors.js';

const log = createLogger('silent');

test('round-robin distributes keys', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a', 'b', 'c'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log, () => t);
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const k = pool.acquire();
    seen.push(k.key);
    k.release();
  }
  assert.deepEqual(seen, ['a', 'b', 'c', 'a', 'b', 'c']);
});

test('respects per-key concurrency by rotating to a free key', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 1, cooldownMs: 60_000 }, log, () => t);
  const a = pool.acquire(); // holds 'a'
  const b = pool.acquire(); // 'a' full -> 'b'
  assert.equal(a.key, 'a');
  assert.equal(b.key, 'b');
  assert.throws(() => pool.acquire(), AllKeysUnavailableError); // both full
  a.release();
  assert.equal(pool.acquire().key, 'a');
});

test('markUnavailable cools a key; it recovers after cooldownMs', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log, () => t);
  pool.markUnavailable('a');
  assert.equal(pool.acquire().key, 'b');
  t += 60_001;
  assert.equal(pool.acquire().key, 'a'); // recovered
});

test('stats reports total/available/cooldown', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log, () => t);
  pool.markUnavailable('a');
  assert.deepEqual(pool.stats(), { total: 2, available: 1, cooldown: 1 });
});

test('throws when all keys are on cooldown', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log, () => t);
  pool.markUnavailable('a');
  assert.throws(() => pool.acquire(), AllKeysUnavailableError);
});
