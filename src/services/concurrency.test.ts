import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConcurrencyLimiter } from './concurrency.js';
import { createLogger } from '../utils/logger.js';
import { ConcurrencyLimitError } from '../utils/errors.js';

const log = createLogger('silent');

test('runs up to max concurrently, queues the rest', async () => {
  const lim = new ConcurrencyLimiter(2, log);
  let active = 0;
  let maxActive = 0;
  const task = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
  };
  await Promise.all(Array.from({ length: 5 }, () => lim.run(task)));
  assert.equal(maxActive, 2);
  assert.deepEqual(lim.stats(), { current: 0, max: 2 });
});

test('rejects with ConcurrencyLimitError when queue timeout elapses', async () => {
  const lim = new ConcurrencyLimiter(1, log);
  // occupy the single slot for the whole test
  const hold = lim.run(() => new Promise<void>((r) => setTimeout(r, 200)));
  await assert.rejects(() => lim.run(() => Promise.resolve(1), 50), ConcurrencyLimitError);
  await hold;
});
