import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelClient } from './model-client.js';
import { KeyPool } from './key-pool.js';
import { createLogger } from '../utils/logger.js';
import { AllKeysUnavailableError, ModelRequestError } from '../utils/errors.js';
import type { AppConfig } from '../config.js';
import type { ProcessedImage } from '../types.js';

const log = createLogger('silent');
const baseCfg: AppConfig = {
  port: 3000, apiKeys: ['a', 'b', 'c'], apiBaseUrl: 'https://example.test/anthropic', modelId: 'xopkimik26',
  maxConcurrency: 100, perKeyConcurrency: 20, maxRetries: 3, keyCooldownMs: 60_000, retryDelayMs: 1, maxRetryDelayMs: 10,
  imageMaxSizeBytes: 10 * 1024 * 1024, imageStandardMaxDim: 2048, imageOcrMaxDim: 4096, imageDiffMaxDim: 1536, modelTimeoutMs: 30000, logLevel: 'silent', rejectUnauthorized: true,
};
const img: ProcessedImage = { base64: 'AAAA', mediaType: 'image/jpeg', width: 10, height: 10, bytes: 4 };

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let i = 0;
  const calls: Array<{ headers: Record<string, string>; url: string }> = [];
  const fetchFn = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  };
  return { fetchFn, calls };
}

test('returns model text on success', async () => {
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn, calls } = mockFetch([{ status: 200, body: { content: [{ type: 'text', text: 'hello world' }], stop_reason: 'end_turn' } }]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  const res = await client.complete({ system: 'sys', userText: 'q', image: img });
  assert.equal(res.text, 'hello world');
  assert.equal(res.stopReason, 'end_turn');
  assert.match(calls[0]!.url, /\/anthropic\/v1\/messages$/);
  assert.equal(calls[0]!.headers['x-api-key'], 'a');
  assert.equal(calls[0]!.headers['anthropic-version'], '2023-06-01');
});

test('retries 429 by rotating to the next key', async () => {
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn, calls } = mockFetch([
    { status: 429, body: { error: { message: 'rate' } } },
    { status: 200, body: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } },
  ]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  const res = await client.complete({ system: 'sys', userText: 'q', image: img });
  assert.equal(res.text, 'ok');
  assert.equal(calls[0]!.headers['x-api-key'], 'a');
  assert.equal(calls[1]!.headers['x-api-key'], 'b');
  assert.deepEqual(pool.stats(), { total: 2, available: 1, cooldown: 1 }); // 'a' cooled down
});

test('retries 500 with exponential backoff then succeeds', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn, calls } = mockFetch([
    { status: 503, body: { error: { message: 'boom' } } },
    { status: 502, body: { error: { message: 'boom' } } },
    { status: 200, body: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } },
  ]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  const res = await client.complete({ system: 'sys', userText: 'q', image: img });
  assert.equal(res.text, 'ok');
  assert.equal(calls.length, 3);
});

test('non-retryable 4xx throws ModelRequestError retryable=false', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn } = mockFetch([{ status: 400, body: { error: { message: 'bad request' } } }]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  await assert.rejects(
    () => client.complete({ system: 'sys', userText: 'q', image: img }),
    (e: unknown) => e instanceof ModelRequestError && (e as ModelRequestError).status === 400 && (e as ModelRequestError).retryable === false,
  );
});

test('retries exhausted on 500 throws ModelRequestError retryable=true', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn } = mockFetch([{ status: 500, body: { error: { message: 'down' } } }]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  await assert.rejects(
    () => client.complete({ system: 'sys', userText: 'q', image: img }),
    (e: unknown) => e instanceof ModelRequestError && (e as ModelRequestError).retryable === true,
  );
});

test('all keys on cooldown -> AllKeysUnavailableError', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  pool.markUnavailable('a');
  const client = new ModelClient(baseCfg, pool, log, async () => ({}) as Response);
  await assert.rejects(() => client.complete({ system: 'sys', userText: 'q', image: img }), AllKeysUnavailableError);
});

test('completeMulti sends all images in one message', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  let captured: unknown;
  const fetchFn = async (_url: string, init: { body: string }) => {
    captured = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'diff' }], stop_reason: 'end_turn' }), text: async () => '' };
  };
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  const res = await client.completeMulti({ system: 's', userText: 'compare', images: [img, img] });
  assert.equal(res.text, 'diff');
  const content = (captured as { messages: Array<{ content: Array<{ type: string }> }> }).messages[0]!.content;
  assert.equal(content[0]!.type, 'image');
  assert.equal(content[1]!.type, 'image');
  assert.equal(content[2]!.type, 'text');
});
