import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { ImageProcessor } from '../services/image-processor.js';
import { ModelClient } from '../services/model-client.js';
import { KeyPool } from '../services/key-pool.js';
import { ConcurrencyLimiter } from '../services/concurrency.js';
import { createLogger } from '../utils/logger.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';
import { runSingleImageTool, runDoubleImageTool, ImageInputSchema } from './shared.js';
import type { AppConfig } from '../config.js';

const log = createLogger('silent');
const baseCfg: AppConfig = {
  port: 3000, apiKeys: ['a'], apiBaseUrl: 'https://example.test/anthropic', modelId: 'xopkimik26',
  maxConcurrency: 100, perKeyConcurrency: 20, maxRetries: 1, keyCooldownMs: 60_000, retryDelayMs: 1, maxRetryDelayMs: 10,
  imageMaxSizeBytes: 10 * 1024 * 1024, imageStandardMaxDim: 2048, imageOcrMaxDim: 4096, imageDiffMaxDim: 1536, modelTimeoutMs: 30000, logLevel: 'silent', rejectUnauthorized: true,
};

async function whitePng(): Promise<{ base64: string; mimeType: string }> {
  const raw = Buffer.alloc(8 * 8 * 4, 0xff);
  const buf = await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer();
  return { base64: buf.toString('base64'), mimeType: 'image/png' };
}

function ctxWithFetch(fetchFn: typeof fetch): { ctx: ReturnType<typeof makeCtx>; calls: { value: number } } {
  let calls = { value: 0 };
  const wrapped = (async (url: string, init: RequestInit) => {
    calls.value++;
    return fetchFn(url, init);
  }) as unknown as typeof fetch;
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const model = new ModelClient(baseCfg, pool, log, wrapped);
  const processor = new ImageProcessor({ maxSizeBytes: baseCfg.imageMaxSizeBytes, standardMaxDim: 2048, ocrMaxDim: 4096, diffMaxDim: 1536 }, log);
  const limiter = new ConcurrencyLimiter(100, log);
  function makeCtx() { return { processor, model, limiter }; }
  return { ctx: makeCtx(), calls };
}

function okFetch(): typeof fetch {
  return (async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: 'RESULT' }], stop_reason: 'end_turn' }),
    text: async () => '',
  })) as unknown as typeof fetch;
}

test('ImageInputSchema accepts valid and rejects empty base64', () => {
  assert.doesNotThrow(() => ImageInputSchema.parse({ base64: 'AAAA' }));
  assert.throws(() => ImageInputSchema.parse({ base64: '' }));
});

test('runSingleImageTool processes image then calls model once', async () => {
  const { ctx, calls } = ctxWithFetch(okFetch());
  const text = await runSingleImageTool({ ctx, image: await whitePng(), mode: 'standard', prompt: SYSTEM_PROMPTS.imageAnalysis, question: 'describe' });
  assert.equal(text, 'RESULT');
  assert.equal(calls.value, 1);
});

test('runDoubleImageTool sends both images and calls model once', async () => {
  const { ctx, calls } = ctxWithFetch(okFetch());
  const img = await whitePng();
  const text = await runDoubleImageTool({ ctx, before: img, after: img, mode: 'diff', prompt: SYSTEM_PROMPTS.uiDiffCheck, question: 'compare' });
  assert.equal(text, 'RESULT');
  assert.equal(calls.value, 1);
});
