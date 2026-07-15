import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  UnsupportedImageFormatError,
  ImageTooLargeError,
  AllKeysUnavailableError,
  ConcurrencyLimitError,
  ModelRequestError,
} from './errors.js';

test('error classes carry names and are instanceof Error', () => {
  for (const Err of [ConfigError, UnsupportedImageFormatError, ImageTooLargeError, AllKeysUnavailableError, ConcurrencyLimitError]) {
    const e = new Err('boom');
    assert.ok(e instanceof Error);
    assert.equal(e.name, Err.name);
    assert.equal(e.message, 'boom');
  }
});

test('ModelRequestError exposes status and retryable', () => {
  const e = new ModelRequestError('rate limited', 429, true);
  assert.equal(e.status, 429);
  assert.equal(e.retryable, true);
  assert.equal(e.name, 'ModelRequestError');
});
