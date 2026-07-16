import type { AppConfig } from '../config.js';
import type { KeyPool } from './key-pool.js';
import type { Logger } from '../utils/logger.js';
import { ModelRequestError, AllKeysUnavailableError } from '../utils/errors.js';
import type { ProcessedImage } from '../types.js';

export interface CompleteRequest {
  system: string;
  userText: string;
  image: ProcessedImage;
  maxTokens?: number;
}

export interface CompleteMultiRequest {
  system: string;
  userText: string;
  images: ProcessedImage[];
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  stopReason?: string;
}

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

export class ModelClient {
  constructor(
    private readonly cfg: AppConfig,
    private readonly keyPool: KeyPool,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    // Allow intranet self-signed endpoints (e.g. company gateways) when explicitly opted in.
    // NODE_TLS_REJECT_UNAUTHORIZED is Node's process-wide switch; we set it only when the
    // user opted in via REJECT_UNAUTHORIZED=0, and only model requests (this client) use it.
    if (!cfg.rejectUnauthorized) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      logger.warn('TLS 证书校验已关闭（REJECT_UNAUTHORIZED=0）—— 仅适用于内网自签端点');
    }
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    return this.completeMulti({ system: req.system, userText: req.userText, images: [req.image], maxTokens: req.maxTokens });
  }

  async completeMulti(req: CompleteMultiRequest): Promise<CompleteResult> {
    const url = `${this.cfg.apiBaseUrl}/v1/messages`;
    const body = {
      model: this.cfg.modelId,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: req.system,
      messages: [
        {
          role: 'user',
          content: [
            ...req.images.map((im, idx) => ({
              type: 'image',
              source: { type: 'base64', media_type: im.mediaType, data: im.base64 },
              ...(req.images.length > 1 ? { _label: idx === 0 ? 'image_before' : 'image_after' } : {}),
            })),
            { type: 'text', text: req.userText },
          ],
        },
      ],
    };

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= this.cfg.maxRetries) {
      const acquired = this.keyPool.acquire(); // throws AllKeysUnavailableError if none
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': acquired.key,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.cfg.modelTimeoutMs),
        });

        if (res.ok) {
          const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
          const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
          return { text, stopReason: data.stop_reason };
        }

        const errText = await res.text().catch(() => '');
        lastError = new ModelRequestError(this.friendlyMessage(res.status, errText), res.status, this.isRetryable(res.status));

        if (res.status === 401 || res.status === 403 || res.status === 429) {
          this.keyPool.markUnavailable(acquired.key);
          this.logger.warn({ status: res.status, attempt }, 'key marked unavailable, rotating');
          attempt += 1;
          continue;
        }

        if (this.isRetryable(res.status)) {
          await this.backoff(attempt);
          attempt += 1;
          continue;
        }

        throw lastError; // non-retryable 4xx
      } catch (err) {
        if (err instanceof ModelRequestError && !err.retryable) throw err;
        if (err instanceof AllKeysUnavailableError) throw err;
        // network / fetch error -> retry with backoff
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn({ attempt, err: lastError.message }, 'transient error, backing off');
        await this.backoff(attempt);
        attempt += 1;
      } finally {
        acquired.release();
      }
    }

    if (lastError instanceof ModelRequestError) throw lastError;
    throw new ModelRequestError('模型服务暂时不可用，请稍后重试', 503, true);
  }

  private isRetryable(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503;
  }

  private async backoff(attempt: number): Promise<void> {
    const base = this.cfg.retryDelayMs * 2 ** attempt;
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(base + jitter, this.cfg.maxRetryDelayMs);
    await new Promise((r) => setTimeout(r, delay));
  }

  private friendlyMessage(status: number, errText: string): string {
    if (status === 429) return '模型服务暂时不可用，请稍后重试';
    if (status >= 500) return '模型服务暂时不可用，请稍后重试';
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      // fall through
    }
    return `模型请求失败 (HTTP ${status})`;
  }
}
