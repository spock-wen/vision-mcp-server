import { test } from 'node:test';
import assert from 'node:assert/strict';

test('scaffolding can import TypeScript', () => {
  const sum = (a: number, b: number): number => a + b;
  assert.equal(sum(1, 2), 3);
});
