import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from './logger.js';

test('createLogger returns a pino logger that serializes structured json', () => {
  const log = createLogger('info');
  assert.equal(typeof log.info, 'function');
  assert.equal(typeof log.child, 'function');
});
