import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVisionServer } from './server.js';
import { loadConfig } from './config.js';

test('createVisionServer connects transport and registers tools', () => {
  const cfg = loadConfig({ API_KEYS: 'k1,k2', MAX_CONCURRENCY: '100' });
  const v = createVisionServer(cfg);
  assert.equal(v.transport.sessionId, undefined);
  assert.equal(typeof v.handleRequest, 'function');
  const names = Object.keys((v.server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools ?? {});
  assert.equal(names.length, 7);
});
