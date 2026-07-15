import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPTS } from './index.js';

const REQUIRED = ['imageAnalysis', 'uiToArtifact', 'diagnoseError', 'understandDiagram', 'analyzeDataViz', 'extractText', 'uiDiffCheck'] as const;

test('SYSTEM_PROMPTS has all 7 prompts as non-empty strings', () => {
  for (const key of REQUIRED) {
    assert.ok(key in SYSTEM_PROMPTS, `missing ${key}`);
    assert.ok(typeof SYSTEM_PROMPTS[key] === 'string' && (SYSTEM_PROMPTS[key] as string).length > 20, `empty ${key}`);
  }
});
