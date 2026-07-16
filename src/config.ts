import { z } from 'zod';
import { ConfigError } from './utils/errors.js';

const EnvSchema = z.object({
  PORT: z.string().default('3000'),
  // Singular API_KEY is the single-user / local form; API_KEYS (comma-separated) is the
  // multi-key form. Either is accepted; singular takes precedence when both are set.
  API_KEY: z.string().optional(),
  API_KEYS: z.string().optional(),
  API_BASE_URL: z.string().default('https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic'),
  MODEL_ID: z.string().default('xopkimik26'),
  MAX_CONCURRENCY: z.string().default('100'),
  PER_KEY_CONCURRENCY: z.string().default('20'),
  MAX_RETRIES: z.string().default('3'),
  KEY_COOLDOWN_MS: z.string().default('60000'),
  RETRY_DELAY_MS: z.string().default('1000'),
  MAX_RETRY_DELAY_MS: z.string().default('10000'),
  IMAGE_MAX_SIZE_MB: z.string().default('10'),
  IMAGE_MAX_DIMENSION: z.string().default('2048'),
  IMAGE_OCR_MAX_DIMENSION: z.string().default('4096'),
  LOG_LEVEL: z.string().default('info'),
});

export interface AppConfig {
  port: number;
  apiKeys: string[];
  apiBaseUrl: string;
  modelId: string;
  maxConcurrency: number;
  perKeyConcurrency: number;
  maxRetries: number;
  keyCooldownMs: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  imageMaxSizeBytes: number;
  imageStandardMaxDim: number;
  imageOcrMaxDim: number;
  logLevel: string;
}

function toInt(raw: string, field: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new ConfigError(`${field} is not a valid integer: ${raw}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  let parsed;
  try {
    parsed = EnvSchema.parse(env);
  } catch (err) {
    throw new ConfigError(`Invalid configuration: ${(err as Error).message}`);
  }

  const combined = [parsed.API_KEY ?? '', parsed.API_KEYS ?? ''].filter(Boolean).join(',');
  const apiKeys = combined.split(',').map((k) => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) {
    throw new ConfigError('必须配置 API_KEY（单个）或 API_KEYS（逗号分隔多个）环境变量');
  }

  const imageMaxMb = toInt(parsed.IMAGE_MAX_SIZE_MB, 'IMAGE_MAX_SIZE_MB');

  return {
    port: toInt(parsed.PORT, 'PORT'),
    apiKeys,
    apiBaseUrl: parsed.API_BASE_URL.replace(/\/+$/, ''),
    modelId: parsed.MODEL_ID,
    maxConcurrency: toInt(parsed.MAX_CONCURRENCY, 'MAX_CONCURRENCY'),
    perKeyConcurrency: toInt(parsed.PER_KEY_CONCURRENCY, 'PER_KEY_CONCURRENCY'),
    maxRetries: toInt(parsed.MAX_RETRIES, 'MAX_RETRIES'),
    keyCooldownMs: toInt(parsed.KEY_COOLDOWN_MS, 'KEY_COOLDOWN_MS'),
    retryDelayMs: toInt(parsed.RETRY_DELAY_MS, 'RETRY_DELAY_MS'),
    maxRetryDelayMs: toInt(parsed.MAX_RETRY_DELAY_MS, 'MAX_RETRY_DELAY_MS'),
    imageMaxSizeBytes: imageMaxMb * 1024 * 1024,
    imageStandardMaxDim: toInt(parsed.IMAGE_MAX_DIMENSION, 'IMAGE_MAX_DIMENSION'),
    imageOcrMaxDim: toInt(parsed.IMAGE_OCR_MAX_DIMENSION, 'IMAGE_OCR_MAX_DIMENSION'),
    logLevel: parsed.LOG_LEVEL,
  };
}
