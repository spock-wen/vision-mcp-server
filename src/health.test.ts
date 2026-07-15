import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHealthHandler } from './health.js';
import { KeyPool } from './services/key-pool.js';
import { ConcurrencyLimiter } from './services/concurrency.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('silent');

test('health handler returns status/keys/concurrency shape', () => {
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  pool.markUnavailable('a');
  const limiter = new ConcurrencyLimiter(100, log);
  const handler = createHealthHandler({ keyPool: pool, limiter: limiter });
  const captured: string[] = [];
  const res = { statusCode: 0, setHeader: () => {}, end: (body: string) => captured.push(body) } as unknown as import('node:http').ServerResponse;
  handler(res);
  const json = JSON.parse(captured[0]!);
  assert.deepEqual(json, { status: 'ok', keys: { total: 2, available: 1, cooldown: 1 }, concurrency: { current: 0, max: 100 } });
});
