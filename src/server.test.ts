import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVisionServer } from './server.js';
import { loadConfig } from './config.js';

test('createVisionServer exposes handleRequest, shared pool/limiter, and registers 7 tools', async () => {
  const cfg = loadConfig({ API_KEYS: 'k1,k2', MAX_CONCURRENCY: '100' });
  const v = createVisionServer(cfg);
  assert.equal(typeof v.handleRequest, 'function');
  assert.equal(typeof v.buildServer, 'function');
  assert.ok(v.keyPool);
  assert.ok(v.limiter);
  const server = await v.buildServer();
  const names = Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools ?? {});
  assert.equal(names.length, 7);
  // cleanup
  await server.close().catch(() => {});
});
