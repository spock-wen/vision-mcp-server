import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';
import { ConfigError } from './utils/errors.js';

const BASE = { API_KEYS: 'k1,k2,k3' } as NodeJS.ProcessEnv;

test('loadConfig applies defaults', () => {
  const c = loadConfig({ ...BASE });
  assert.equal(c.port, 3000);
  assert.deepEqual(c.apiKeys, ['k1', 'k2', 'k3']);
  assert.equal(c.apiBaseUrl, 'https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic');
  assert.equal(c.modelId, 'xopkimik26');
  assert.equal(c.maxConcurrency, 100);
  assert.equal(c.perKeyConcurrency, 20);
  assert.equal(c.maxRetries, 3);
  assert.equal(c.keyCooldownMs, 60000);
  assert.equal(c.retryDelayMs, 1000);
  assert.equal(c.maxRetryDelayMs, 10000);
  assert.equal(c.imageMaxSizeBytes, 10 * 1024 * 1024);
  assert.equal(c.imageStandardMaxDim, 2048);
  assert.equal(c.imageOcrMaxDim, 4096);
  assert.equal(c.logLevel, 'info');
});

test('loadConfig overrides from env', () => {
  const c = loadConfig({ ...BASE, PORT: '8080', MAX_CONCURRENCY: '50', MAX_RETRIES: '5' });
  assert.equal(c.port, 8080);
  assert.equal(c.maxConcurrency, 50);
  assert.equal(c.maxRetries, 5);
});

test('loadConfig throws ConfigError when API_KEYS missing', () => {
  assert.throws(() => loadConfig({}), ConfigError);
});

test('loadConfig throws ConfigError when API_KEYS empty', () => {
  assert.throws(() => loadConfig({ API_KEYS: ' , ' }), ConfigError);
});
