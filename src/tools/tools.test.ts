import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ImageProcessor } from '../services/image-processor.js';
import { ModelClient } from '../services/model-client.js';
import { KeyPool } from '../services/key-pool.js';
import { ConcurrencyLimiter } from '../services/concurrency.js';
import { createLogger } from '../utils/logger.js';
import { registerAllTools } from './index.js';
import type { AppConfig } from '../config.js';
import type { ToolContext } from './shared.js';

const log = createLogger('silent');
const baseCfg: AppConfig = {
  port: 3000, apiKeys: ['a'], apiBaseUrl: 'https://example.test/anthropic', modelId: 'xopkimik26',
  maxConcurrency: 100, perKeyConcurrency: 20, maxRetries: 1, keyCooldownMs: 60_000, retryDelayMs: 1, maxRetryDelayMs: 10,
  imageMaxSizeBytes: 10 * 1024 * 1024, imageStandardMaxDim: 2048, imageOcrMaxDim: 4096, logLevel: 'silent', rejectUnauthorized: true,
};

async function whitePng(): Promise<string> {
  const raw = Buffer.alloc(8 * 8 * 4, 0xff);
  const buf = await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer();
  return buf.toString('base64');
}

function makeServerAndCtx(): { server: McpServer; ctx: ToolContext } {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const model = new ModelClient(baseCfg, pool, log, (async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: 'TOOL_OUT' }], stop_reason: 'end_turn' }),
    text: async () => '',
  })) as unknown as typeof fetch);
  const processor = new ImageProcessor({ maxSizeBytes: baseCfg.imageMaxSizeBytes, standardMaxDim: 2048, ocrMaxDim: 4096, diffMaxDim: 1536 }, log);
  const limiter = new ConcurrencyLimiter(100, log);
  const ctx: ToolContext = { processor, model, limiter };
  const server = new McpServer({ name: 'vision-mcp-server', version: '1.0.0' });
  return { server, ctx };
}

test('registerAllTools registers exactly the 7 tool names', () => {
  const { server, ctx } = makeServerAndCtx();
  registerAllTools(server, ctx);
  const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  const names = Object.keys(registered ?? {});
  assert.deepEqual([...names].sort(), [
    'analyze_data_visualization',
    'diagnose_error_screenshot',
    'extract_text_from_screenshot',
    'image_analysis',
    'ui_diff_check',
    'ui_to_artifact',
    'understand_technical_diagram',
  ]);
});

test('image_analysis tool returns model text in a CallToolResult', async () => {
  const { server, ctx } = makeServerAndCtx();
  registerAllTools(server, ctx);
  const registered = (server as unknown as {
    _registeredTools: Record<string, { handler: (args: Record<string, unknown>, extra: object) => Promise<unknown> }>;
  })._registeredTools['image_analysis']!;
  const out = (await registered.handler(
    { image: { base64: await whitePng() }, question: 'what' },
    {},
  )) as { content: Array<{ type: string; text?: string }> };
  assert.equal(out.content[0]!.type, 'text');
  assert.equal(out.content[0]!.text, 'TOOL_OUT');
});
