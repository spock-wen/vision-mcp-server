import type { Logger } from '../utils/logger.js';
import { ConcurrencyLimitError } from '../utils/errors.js';

export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: Array<{ resolve: () => void; reject: (e: Error) => void; timer?: NodeJS.Timeout }> = [];

  constructor(private readonly max: number, private readonly logger: Logger) {}

  async run<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    await this.acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(timeoutMs?: number): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const w: { resolve: () => void; reject: (e: Error) => void; timer?: NodeJS.Timeout } = { resolve, reject };
      if (timeoutMs !== undefined) {
        w.timer = setTimeout(() => {
          const idx = this.waiters.indexOf(w);
          if (idx >= 0) this.waiters.splice(idx, 1);
          reject(new ConcurrencyLimitError('服务繁忙，请稍后重试'));
        }, timeoutMs);
      }
      this.waiters.push(w);
    }).then(() => {
      this.active++;
    });
  }

  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      next.resolve();
    }
  }

  stats(): { current: number; max: number } {
    return { current: this.active, max: this.max };
  }
}
