import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransport } from './streamable-http.js';
import { createLogger } from '../utils/logger.js';

test('buildTransport returns a stateless transport (no session id)', () => {
  const t = buildTransport(createLogger('silent'));
  assert.equal(t.sessionId, undefined);
  assert.equal(typeof t.handleRequest, 'function');
});
